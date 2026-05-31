# DiamondHub AWS Deployment

**~$29/mo total** — EC2 t4g.small + RDS t4g.micro + S3/CloudFront + local Redis

## Architecture

```
Browser → CloudFront → S3 (React SPA)
              ↓
Browser → nginx → EC2 t4g.small → Fastify API :3000
                                → BullMQ Workers
                                → Redis (local, :6379)
                                → RDS t4g.micro (PostgreSQL 16 + PostGIS)
```

---

## Prerequisites

```bash
npm install -g aws-cdk
aws configure          # set access key, secret, region
cd infra/cdk
npm install
```

---

## Step 1 — Create a key pair

```bash
aws ec2 create-key-pair \
  --key-name diamondhub-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/diamondhub-key.pem
chmod 400 ~/.ssh/diamondhub-key.pem
```

---

## Step 2 — Deploy infrastructure

```bash
cd infra/cdk
cdk bootstrap   # once per account/region
cdk deploy \
  -c keyPairName=diamondhub-key \
  -c allowSshFromCidr=YOUR_IP/32   # restrict SSH to your IP
```

Copy the outputs:
- `ServerIp` — your EC2 IP
- `DbEndpoint` — RDS hostname
- `DbSecretArn` — Secrets Manager ARN
- `WebBucketName` — S3 bucket
- `CloudFrontId` — distribution ID
- `CloudFrontDomain` — frontend URL

---

## Step 3 — Point DNS

Create two A/CNAME records:
- `api.yourdomain.com` → `ServerIp` (A record)
- `app.yourdomain.com` → `CloudFrontDomain` (CNAME)

---

## Step 4 — Set up the server (once)

```bash
ssh -i ~/.ssh/diamondhub-key.pem ubuntu@<ServerIp>

bash <(curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/diamondhub/main/infra/setup.sh) \
  <DbEndpoint> \
  <DbSecretArn> \
  api.yourdomain.com \
  https://github.com/YOUR_ORG/diamondhub.git
```

After setup, fill in the API keys:
```bash
nano /app/diamondhub/.env
# Add: SENDGRID_API_KEY, STRIPE_SECRET_KEY, GOOGLE_CLIENT_ID etc.
pm2 restart all
```

---

## Step 5 — Deploy frontend

```bash
./infra/deploy-frontend.sh \
  <WebBucketName> \
  <CloudFrontId> \
  https://api.yourdomain.com
```

---

## Ongoing deploys

**API + Workers (from your machine):**
```bash
./infra/deploy.sh <ServerIp> ~/.ssh/diamondhub-key.pem main
```

**Frontend only:**
```bash
./infra/deploy-frontend.sh <WebBucketName> <CloudFrontId> https://api.yourdomain.com
```

---

## Cost breakdown

| Resource | Type | $/mo |
|---|---|---|
| EC2 (API + Workers + Redis) | t4g.small | ~$12 |
| RDS (PostgreSQL + PostGIS) | db.t4g.micro | ~$12 |
| S3 + CloudFront | PriceClass_100 | ~$2 |
| Elastic IP | — | ~$0 (free when attached) |
| Secrets Manager | 1 secret | ~$0.40 |
| **Total** | | **~$26–30** |

To reduce further: use RDS free tier (db.t3.micro, 12mo free) + EC2 free tier (t3.micro, 12mo free) in the first year → **~$3/mo**.
