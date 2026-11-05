# Deploy CustomAlboom on a Hostinger VPS

This deployment runs the Next.js server directly on the VPS. Cloudflare, R2, D1 and MySQL are not required.

## 1. Create the service user and persistent storage

Run these commands as root on Ubuntu:

```sh
adduser --system --group --home /var/www/customalboom customalboom
mkdir -p /var/www/customalboom /var/lib/customalboom /etc/customalboom
chown -R customalboom:customalboom /var/www/customalboom /var/lib/customalboom
chmod 750 /var/lib/customalboom
```

Upload and extract the release into `/var/www/customalboom`. Install and build it as the service user:

```sh
cd /var/www/customalboom
sudo -u customalboom npm ci
sudo -u customalboom npm run build
```

The release directory may be replaced during future deployments. `/var/lib/customalboom` must remain in place because it contains `style.asp`, template files, previews and logos.

## 2. Configure environment variables

Create `/etc/customalboom/customalboom.env`:

```dotenv
NODE_ENV=production
PORT=3000
HOSTNAME=127.0.0.1
CUSTOMALBOOM_DATA_DIR=/var/lib/customalboom
KINGKONG_USERNAME=admin
KINGKONG_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_PASSWORD
```

Then protect it:

```sh
chown root:customalboom /etc/customalboom/customalboom.env
chmod 640 /etc/customalboom/customalboom.env
```

The username/password are read only when the first `style.asp` is created. Changing the environment values later does not overwrite the existing admin credentials.

## 3. Install the systemd service

Copy `customalboom.service` to `/etc/systemd/system/customalboom.service`, then run:

```sh
systemctl daemon-reload
systemctl enable --now customalboom
systemctl status customalboom
```

## 4. Configure Nginx and HTTPS

Replace `example.com` in `nginx.conf`, copy it to `/etc/nginx/sites-available/customalboom`, and enable it:

```sh
ln -s /etc/nginx/sites-available/customalboom /etc/nginx/sites-enabled/customalboom
nginx -t
systemctl reload nginx
certbot --nginx -d example.com -d www.example.com
```

Point the domain's A record directly to the Hostinger VPS IP. Cloudflare does not need to sit in front of it.

## Updates and backups

Before an update, back up `/var/lib/customalboom`. Replace only the files in `/var/www/customalboom`, preserve `/etc/customalboom/customalboom.env`, run `npm ci` and `npm run build`, then restart:

```sh
systemctl restart customalboom
journalctl -u customalboom -n 100 --no-pager
```

For reliable operation, schedule a daily backup of `/var/lib/customalboom` to storage outside this VPS.
