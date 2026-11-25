#!/usr/bin/env bash
# ==============================================================================
# Checklist / Referensi Hardening VPS Ubuntu/Debian (Data Center Indonesia)
# Sesuai PRD Halaman 3:
#   1. Hanya port 443 (HTTPS) dan 22 (SSH) terbuka
#   2. Login SSH pakai key, password SSH dimatikan
#   3. fail2ban aktif
#   4. unattended-upgrades aktif
# JANGAN jalankan sebelum SSH key Anda sudah teruji bisa login!
# ==============================================================================
set -euo pipefail

echo "=== 1. Konfigurasi Firewall UFW (Hanya 22 & 443) ==="
echo "sudo ufw default deny incoming"
echo "sudo ufw default allow outgoing"
echo "sudo ufw allow 22/tcp"
echo "sudo ufw allow 443/tcp"
echo "sudo ufw enable"

echo ""
echo "=== 2. Aktifkan fail2ban & unattended-upgrades ==="
echo "sudo apt-get update && sudo apt-get install -y fail2ban unattended-upgrades"
echo "sudo systemctl enable --now fail2ban"
echo "sudo dpkg-reconfigure -plow unattended-upgrades"

echo ""
echo "=== 3. Nonaktifkan Password SSH (pastikan SSH key sudah aktif!) ==="
echo "Edit /etc/ssh/sshd_config:"
echo "  PasswordAuthentication no"
echo "  PermitRootLogin no"
echo "  PubkeyAuthentication yes"
echo "Lalu: sudo systemctl reload ssh"
