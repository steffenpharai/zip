# Troubleshooting: Can't Access localhost:3000

## Quick Checks

### 1. Is the service running?

```bash
./scripts/start-local.sh status
```

Or check manually:
```bash
curl http://localhost:3000/api/health
```

### 2. Check what's listening on port 3000

```bash
lsof -i:3000
# or
ss -tlnp | grep :3000
```

### 3. Try different URLs

The service might be accessible on:
- `http://localhost:3000`
- `http://127.0.0.1:3000`
- `http://[your-ip]:3000` (check with `hostname -I`)

## Common Issues

### Issue: "Connection Refused"

**Symptoms:** Browser shows "This site can't be reached" or "Connection refused"

**Solutions:**

1. **Service not running:**
   ```bash
   ./scripts/start-local.sh frontend
   ```

2. **Port conflict:**
   ```bash
   # Check what's using port 3000
   lsof -i:3000
   # Kill the process if needed
   kill -9 <PID>
   ```

3. **Firewall blocking:**
   ```bash
   # Check firewall status
   sudo ufw status
   # If firewall is active, allow port 3000
   sudo ufw allow 3000
   ```

### Issue: Service Starts Then Dies

**Symptoms:** Service appears to start but then stops immediately

**Check logs:**
```bash
tail -f /tmp/zip-frontend.log
```

**Common causes:**
- Permission errors (use `--fix-permissions` flag)
- Missing dependencies (`npm install`)
- Port already in use
- Build errors

**Solution:**
```bash
./scripts/start-local.sh frontend --fix-permissions
```

### Issue: Can Access from Command Line but Not Browser

**Symptoms:** `curl http://localhost:3000` works but browser doesn't

**Possible causes:**
1. **Browser cache:** Clear browser cache or try incognito mode
2. **Proxy settings:** Check browser proxy settings
3. **HTTPS redirect:** Make sure you're using `http://` not `https://`
4. **Browser extensions:** Disable extensions that might block localhost

### Issue: Accessing from Another Machine

**Symptoms:** Works on localhost but not from another device

**Solutions:**

1. **Use network IP instead of localhost:**
   ```bash
   # Find your IP
   hostname -I
   # Access via: http://[your-ip]:3000
   ```

2. **Check Next.js is binding to all interfaces:**
   The service should show:
   ```
   - Local:         http://localhost:3000
   - Network:       http://[your-ip]:3000
   ```

3. **Firewall on host machine:**
   ```bash
   sudo ufw allow 3000/tcp
   ```

4. **Firewall on client machine:** Make sure client firewall allows outbound connections

## Diagnostic Commands

### Check Service Status
```bash
./scripts/start-local.sh status
```

### Test Connectivity
```bash
# Test localhost
curl -v http://localhost:3000/api/health

# Test 127.0.0.1
curl -v http://127.0.0.1:3000/api/health

# Test network IP
curl -v http://$(hostname -I | awk '{print $1}'):3000/api/health
```

### View Real-time Logs
```bash
tail -f /tmp/zip-frontend.log
```

### Check Process
```bash
ps aux | grep "next dev"
```

### Check Port Binding
```bash
netstat -tlnp | grep :3000
# or
ss -tlnp | grep :3000
```

## Restart Everything

If nothing else works, try a complete restart:

```bash
# Stop everything
./scripts/start-local.sh stop

# Kill any remaining processes
pkill -f "next dev"

# Clean build cache (if needed)
rm -rf .next

# Start fresh
./scripts/start-local.sh all --fix-permissions
```

## Still Not Working?

1. **Check Next.js version:**
   ```bash
   npx next --version
   ```

2. **Check Node.js version:**
   ```bash
   node -v  # Should be 18+
   ```

3. **Check for errors in console:**
   ```bash
   npm run dev:local
   # Look for error messages
   ```

4. **Try webpack instead of turbo:**
   ```bash
   npm run dev:webpack
   ```

## Getting Help

If you're still having issues, gather this information:

```bash
# System info
uname -a
node -v
npm -v

# Service status
./scripts/start-local.sh status

# Recent logs
tail -50 /tmp/zip-frontend.log

# Port info
lsof -i:3000
```
