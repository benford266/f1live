# Server Configuration Notes for f1live.myfoodpal.food

## Issue
The frontend HTML loads but JavaScript/CSS assets return 404 errors.

## Solution
Your web server needs to be configured to serve static files from the build directory.

## Nginx Configuration Example
```nginx
server {
    listen 80;
    server_name f1live.myfoodpal.food;
    
    root /path/to/your/build/directory;
    index index.html;
    
    # Serve static assets
    location /static/ {
        try_files $uri $uri/ =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Serve the React app
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Apache Configuration Example
```apache
<VirtualHost *:80>
    ServerName f1live.myfoodpal.food
    DocumentRoot /path/to/your/build/directory
    
    # Serve static assets
    <Directory "/path/to/your/build/directory/static">
        ExpiresActive On
        ExpiresDefault "access plus 1 year"
    </Directory>
    
    # Fallback to index.html for React routing
    FallbackResource /index.html
</VirtualHost>
```

## Express Server Example
If you're using Express to serve the frontend:
```javascript
app.use(express.static('/path/to/build'));
app.get('*', (req, res) => {
  res.sendFile(path.join('/path/to/build/index.html'));
});
```

## Files to Upload
Upload all contents of the `build/` directory to your server:
- index.html
- static/ directory (contains JS, CSS, media files)
- manifest.json, favicon.ico, etc.