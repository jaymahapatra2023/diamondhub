#!/bin/bash
set -e
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
echo "Keys generated:"
echo "  keys/private.pem  (keep secret — never commit)"
echo "  keys/public.pem   (safe to share with services)"
echo ""
echo "Set env vars:"
echo "  JWT_PRIVATE_KEY=\$(cat keys/private.pem)"
echo "  JWT_PUBLIC_KEY=\$(cat keys/public.pem)"
