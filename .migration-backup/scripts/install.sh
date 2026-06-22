#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Danny's Cloud OS — One-Command VPS Install
# Works on: Ubuntu 22/24, Debian 12, Rocky Linux 9, Fedora 38+
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/daviddan-241/Bot444444/main/scripts/install.sh | bash
#
# Or with options:
#   ADMIN_TOKEN=mytoken DOMAIN=cloud.example.com bash install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="https://github.com/daviddan-241/Bot444444"
INSTALL_DIR="${INSTALL_DIR:-/opt/cloudos}"
ADMIN_TOKEN="${ADMIN_TOKEN:-$(openssl rand -hex 24)}"
DOMAIN="${DOMAIN:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 16)}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

banner() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║       Danny's Cloud OS  v2.0             ║${NC}"
  echo -e "${BLUE}║   Self-Hosted Private Cloud Platform     ║${NC}"
  echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

# ── Detect OS ──────────────────────────────────────────────────────────────
detect_os() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_ID=$ID
    OS_VERSION=$VERSION_ID
  else
    error "Cannot detect OS. Supported: Ubuntu, Debian, Rocky Linux, Fedora."
  fi
}

# ── Install Docker ─────────────────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    success "Docker already installed: $(docker --version)"
    return
  fi
  info "Installing Docker..."
  case $OS_ID in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg lsb-release
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$OS_ID/gpg | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/$OS_ID $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    rocky|rhel|centos|almalinux)
      dnf install -y dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    fedora)
      dnf install -y dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    *)
      error "Unsupported OS: $OS_ID. Install Docker manually from https://docs.docker.com/engine/install/"
      ;;
  esac
  systemctl enable --now docker
  success "Docker installed"
}

# ── Install dependencies ───────────────────────────────────────────────────
install_deps() {
  info "Installing system dependencies..."
  case $OS_ID in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq git curl wget openssl ufw fail2ban
      ;;
    rocky|rhel|centos|almalinux|fedora)
      dnf install -y git curl wget openssl firewalld fail2ban
      ;;
  esac
  success "Dependencies installed"
}

# ── Configure firewall ─────────────────────────────────────────────────────
configure_firewall() {
  info "Configuring firewall..."
  if command -v ufw &>/dev/null; then
    ufw allow 22/tcp comment "SSH" || true
    ufw allow 80/tcp comment "HTTP" || true
    ufw allow 443/tcp comment "HTTPS" || true
    ufw --force enable || true
    success "UFW firewall configured"
  elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --permanent --add-service=ssh || true
    firewall-cmd --permanent --add-service=http || true
    firewall-cmd --permanent --add-service=https || true
    firewall-cmd --reload || true
    success "Firewalld configured"
  else
    warn "No firewall found. Consider setting one up manually."
  fi
}

# ── Clone / Update repo ────────────────────────────────────────────────────
setup_repo() {
  info "Setting up Cloud OS in ${INSTALL_DIR}..."
  if [ -d "$INSTALL_DIR/.git" ]; then
    cd "$INSTALL_DIR"
    git pull origin main
    success "Updated to latest version"
  else
    git clone "$REPO" "$INSTALL_DIR"
    success "Repository cloned"
  fi
  cd "$INSTALL_DIR"
}

# ── Write .env ─────────────────────────────────────────────────────────────
write_env() {
  info "Writing .env configuration..."
  cat > "$INSTALL_DIR/.env" << EOF
# Danny's Cloud OS — Environment
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

ADMIN_TOKEN=${ADMIN_TOKEN}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
NODE_ENV=production

# Optional — set your domain for HTTPS
ALLOWED_ORIGIN=${DOMAIN:+https://$DOMAIN}

# Optional — AI assistant
GROQ_API_KEY=

# Optional — GitHub deployments
GITHUB_PERSONAL_ACCESS_TOKEN=
EOF
  chmod 600 "$INSTALL_DIR/.env"
  success ".env written"
}

# ── Start services ─────────────────────────────────────────────────────────
start_services() {
  info "Starting Cloud OS services..."
  cd "$INSTALL_DIR"
  docker compose pull --quiet 2>/dev/null || true
  docker compose build --quiet
  docker compose up -d
  success "Services started"
}

# ── Systemd service for auto-start ────────────────────────────────────────
install_systemd() {
  info "Installing systemd service for auto-start..."
  cat > /etc/systemd/system/cloudos.service << EOF
[Unit]
Description=Danny's Cloud OS
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable cloudos
  success "systemd service installed (auto-starts on boot)"
}

# ── SSL setup hint ────────────────────────────────────────────────────────
ssl_hint() {
  if [ -n "$DOMAIN" ]; then
    info "To enable HTTPS for ${DOMAIN}:"
    echo ""
    echo "  docker run --rm -v \$(pwd)/nginx_certs:/etc/letsencrypt \\"
    echo "    -v \$(pwd)/nginx_webroot:/var/www/certbot \\"
    echo "    certbot/certbot certonly --webroot \\"
    echo "    -w /var/www/certbot -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN"
    echo ""
    echo "  Then uncomment the HTTPS block in nginx/nginx.conf and restart nginx."
  fi
}

# ── Print summary ──────────────────────────────────────────────────────────
print_summary() {
  LOCAL_IP=$(hostname -I | awk '{print $1}')
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║           Cloud OS installed successfully!           ║${NC}"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${BLUE}URL:${NC}          http://${LOCAL_IP}"
  [ -n "$DOMAIN" ] && echo -e "  ${BLUE}Domain:${NC}       https://${DOMAIN}"
  echo -e "  ${BLUE}Admin Token:${NC}  ${ADMIN_TOKEN}"
  echo -e "  ${BLUE}Install Dir:${NC}  ${INSTALL_DIR}"
  echo ""
  echo -e "  ${YELLOW}Save your admin token — you'll need it to log in.${NC}"
  echo ""
  echo -e "  Commands:"
  echo -e "    cd ${INSTALL_DIR}"
  echo -e "    docker compose logs -f          # Watch logs"
  echo -e "    docker compose restart api      # Restart API"
  echo -e "    docker compose down             # Stop everything"
  echo ""
}

# ── Main ───────────────────────────────────────────────────────────────────
main() {
  banner
  [ "$(id -u)" != "0" ] && error "Please run as root: sudo bash install.sh"
  detect_os
  install_deps
  install_docker
  configure_firewall
  setup_repo
  write_env
  start_services
  install_systemd
  ssl_hint
  print_summary
}

main "$@"
