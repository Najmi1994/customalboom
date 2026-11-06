import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const target=path.resolve(root,'app/qa/page.tsx');
if(!target.startsWith(path.resolve(root,'app')+path.sep)) throw new Error('Invalid QA route path.');
if(process.argv.includes('--disable')) { if(fs.existsSync(target)) fs.unlinkSync(target); console.log('Browser QA route disabled.'); }
else { const component = process.argv.includes('--productivity') ? 'ProductivityCheck' : process.argv.includes('--photo-adjustments') ? 'PhotoAdjustmentsCheck' : 'BrowserCheck'; fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,`import BrowserCheck from '../../tests/${component}';\nimport { notFound } from 'next/navigation';\nexport default function QA() { if(process.env.NODE_ENV !== 'development') notFound(); return <BrowserCheck/>; }\n`); console.log('Browser QA enabled at /qa in the local development server.'); }
