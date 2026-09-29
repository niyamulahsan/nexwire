# Custom nginx vhost overrides for app.example.com
# File name should match your APP_DOMAIN exactly.

client_max_body_size 50m;
proxy_read_timeout 300;
proxy_send_timeout 300;

# Protect Queue Dashboard in production
location /board {
    auth_basic "Restricted";
    auth_basic_user_file /etc/nginx/vhost.d/.htpasswd;
}

