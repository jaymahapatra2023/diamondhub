#!/usr/bin/env bash
# DiamondHub EC2 Setup Script
# Run ONCE on a fresh instance after SSH in.
#
# Usage:
#   ssh ubuntu@<SERVER_IP>
#   curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/diamondhub/main/infra/setup.sh | \
#     bash -s -- <DB_HOST> <DB_SECRET_ARN> <API_DOMAIN> <REPO_URL>
#
# Example:
#   bash setup.sh rds-xxx.us-east-1.rds.amazonaws.com \
#     arn:aws:secretsmanager:us-east-1:123:secret:xxx \
#     api.diamondhub.app \
#     https://github.com/YOUR_ORG/diamondhub.git

set -euo pipefail

DB_HOST="${1:?Usage: setup.sh <DB_HOST> <DB_SECRET_ARN> <API_DOMAIN> <REPO_URL>}"
DB_SECRET_ARN="${2:?Missing DB_SECRET_ARN}"
API_DOMAIN="${3:?Missing API_DOMAIN (e.g. api.yourdomain.com)}"
REPO_URL="${4:?Missing REPO_URL}"
APP_DIR="/app/diamondhub"
NODE_VERSION="20"

echo "╔══════════════════════════════════════╗"
echo "║  DiamondHub EC2 Setup                ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── System packages ───────────────────────────────────────────────────────────
echo "▸ Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl git nginx redis-server \
  postgresql-client-16 \
  certbot python3-certbot-nginx \
  unzip jq awscli

# ── Node.js 20 (ARM64) ───────────────────────────────────────────────────────
echo "▸ Installing Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | sudo -E bash - >/dev/null
sudo apt-get install -y -qq nodejs

# ── pnpm + PM2 ───────────────────────────────────────────────────────────────
echo "▸ Installing pnpm and PM2..."
sudo npm install -g pnpm@10 pm2 --quiet

# ── Clone repo ────────────────────────────────────────────────────────────────
echo "▸ Cloning repository..."
sudo mkdir -p /app
sudo chown ubuntu:ubuntu /app
git clone "$REPO_URL" "$APP_DIR"

# ── DB credentials from Secrets Manager ──────────────────────────────────────
echo "▸ Fetching DB credentials from Secrets Manager..."
DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$DB_SECRET_ARN" \
  --query SecretString \
  --output text)
DB_USER=$(echo "$DB_SECRET" | jq -r .username)
DB_PASS=$(echo "$DB_SECRET" | jq -r .password)

# ── JWT keys ──────────────────────────────────────────────────────────────────
echo "▸ Generating JWT keys..."
sudo mkdir -p /etc/diamondhub
sudo chown ubuntu:ubuntu /etc/diamondhub
openssl genrsa -out /etc/diamondhub/jwt_private.pem 2048 2>/dev/null
openssl rsa -in /etc/diamondhub/jwt_private.pem -pubout -out /etc/diamondhub/jwt_public.pem 2>/dev/null
sudo chmod 600 /etc/diamondhub/jwt_private.pem

JWT_PRIVATE=$(cat /etc/diamondhub/jwt_private.pem)
JWT_PUBLIC=$(cat /etc/diamondhub/jwt_public.pem)
COOKIE_SECRET=$(openssl rand -hex 32)

# ── .env file ─────────────────────────────────────────────────────────────────
echo "▸ Writing .env..."
cat > "$APP_DIR/.env" << EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:5432/diamondhub
REDIS_URL=redis://127.0.0.1:6379
JWT_PRIVATE_KEY="${JWT_PRIVATE}"
JWT_PUBLIC_KEY="${JWT_PUBLIC}"
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
COOKIE_SECRET=${COOKIE_SECRET}
NODE_ENV=production
PORT=3000
APP_URL=https://${API_DOMAIN}
API_URL=https://${API_DOMAIN}
CORS_ORIGINS=https://${API_DOMAIN}
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@${API_DOMAIN}
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF
chmod 600 "$APP_DIR/.env"

# ── Install dependencies + build ─────────────────────────────────────────────
echo "▸ Installing dependencies..."
cd "$APP_DIR"
pnpm install --frozen-lockfile --silent

echo "▸ Building packages..."
pnpm --filter @diamondhub/db build
pnpm --filter @diamondhub/contracts build
pnpm --filter @diamondhub/workers build
pnpm --filter @diamondhub/api build

# ── PostGIS + migrations ──────────────────────────────────────────────────────
echo "▸ Enabling PostGIS extension..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -U "$DB_USER" -d diamondhub \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis_topology;" \
  -c "CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;" || true

echo "▸ Running database migrations..."
set -a; source .env; set +a
pnpm --filter @diamondhub/db migrate:deploy

# ── Redis ─────────────────────────────────────────────────────────────────────
echo "▸ Configuring Redis (local, no auth needed — not exposed externally)..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

# ── PM2 ecosystem ─────────────────────────────────────────────────────────────
echo "▸ Creating PM2 ecosystem config..."
sudo mkdir -p /var/log/diamondhub
sudo chown ubuntu:ubuntu /var/log/diamondhub

cat > "$APP_DIR/ecosystem.config.cjs" << 'ECOSYSTEM'
module.exports = {
  apps: [
    {
      name: 'api',
      script: 'dist/index.js',
      cwd: '/app/diamondhub/apps/api',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/app/diamondhub/.env',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/diamondhub/api-error.log',
      out_file: '/var/log/diamondhub/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '400M',
      restart_delay: 3000,
    },
    {
      name: 'workers',
      script: 'dist/run.js',
      cwd: '/app/diamondhub/packages/workers',
      instances: 1,
      exec_mode: 'fork',
      env_file: '/app/diamondhub/.env',
      env: { NODE_ENV: 'production' },
      error_file: '/var/log/diamondhub/workers-error.log',
      out_file: '/var/log/diamondhub/workers-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '300M',
      restart_delay: 3000,
    },
  ],
}
ECOSYSTEM

echo "▸ Starting services with PM2..."
pm2 start "$APP_DIR/ecosystem.config.cjs"
pm2 save

# Enable PM2 on reboot
PM2_STARTUP=$(pm2 startup | grep "sudo" | tail -1)
eval "$PM2_STARTUP"

# ── nginx ─────────────────────────────────────────────────────────────────────
echo "▸ Configuring nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/diamondhub > /dev/null << NGINX
server {
    listen 80;
    server_name ${API_DOMAIN};

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    # Proxy to Fastify API
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        client_max_body_size 10M;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/diamondhub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ── SSL via Let's Encrypt ─────────────────────────────────────────────────────
echo "▸ Obtaining SSL certificate for $API_DOMAIN..."
echo "  (Make sure DNS A record for $API_DOMAIN → $(curl -s http://169.254.169.254/latest/meta-data/public-ipv4) is live before this step)"
read -p "  DNS ready? Press Enter to continue or Ctrl-C to skip SSL for now..."
sudo certbot --nginx -d "$API_DOMAIN" \
  --non-interactive --agree-tos \
  -m "admin@${API_DOMAIN}" \
  --redirect

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Setup complete!                                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  API:       https://${API_DOMAIN}"
echo "  PM2 logs:  pm2 logs"
echo "  PM2 status: pm2 status"
echo ""
echo "  Next: run deploy-frontend.sh to push the web app to S3"
echo ""
echo "  Fill in .env with your API keys:"
echo "    nano /app/diamondhub/.env"
echo "    pm2 restart all"
