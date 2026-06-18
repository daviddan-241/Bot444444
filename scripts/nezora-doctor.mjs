import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const checks = [];
function sh(cmd) {
  try { return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim(); }
  catch (e) { return `ERROR: ${e.message}`; }
}
function add(name, ok, details) { checks.push({ name, ok, details }); }

add('Node.js', /^v(20|22|24)\./.test(sh('node -v')), sh('node -v'));
add('npm', !sh('npm -v').startsWith('ERROR'), sh('npm -v'));
add('Git', !sh('git --version').startsWith('ERROR'), sh('git --version'));
add('Build script', existsSync('package.json') && JSON.parse(readFileSync('package.json', 'utf8')).scripts?.build, 'package.json scripts.build');
add('ADMIN_TOKEN', Boolean(process.env.ADMIN_TOKEN && process.env.ADMIN_TOKEN.length >= 16), process.env.ADMIN_TOKEN ? 'configured' : 'missing');
add('Base domain', Boolean(process.env.NEZORA_BASE_DOMAIN), process.env.NEZORA_BASE_DOMAIN || 'uses default placeholder');
add('Shell locked', process.env.ALLOW_SHELL !== 'true' || process.env.ADMIN_TOKEN, 'ALLOW_SHELL should only be true with ADMIN_TOKEN');

console.log('Nezora Doctor Report');
console.log('====================');
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}: ${c.details}`);
console.log('\nDirections:');
console.log('- Set ADMIN_TOKEN on Render before going public.');
console.log('- Use GitHub Pages for real free static hosting.');
console.log('- Use Render/Koyeb/Fly/etc. for APIs because static hosts cannot run servers.');
process.exit(checks.every(c => c.ok) ? 0 : 1);
