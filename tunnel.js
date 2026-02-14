const localtunnel = require('localtunnel');

(async () => {
  console.log('Starting tunnel on port 8001...');
  const tunnel = await localtunnel({ port: 8001 });
  console.log('');
  console.log('=================================');
  console.log('TUNNEL URL:', tunnel.url);
  console.log('=================================');
  console.log('');
  console.log('Keep this running! Press Ctrl+C to stop.');
  
  tunnel.on('close', () => {
    console.log('Tunnel closed');
    process.exit(0);
  });
  
  tunnel.on('error', (err) => {
    console.error('Tunnel error:', err);
  });
})();
