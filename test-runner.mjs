import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tests = fs.readdirSync('tests').filter(f => f.endsWith('.test.ts'));
console.log(`Found ${tests.length} test files. Executing sequentially...\n`);

let failed = 0;
for (const file of tests) {
    const filePath = path.join('tests', file);
    console.log(`Running ${file}...`);
    // Run using tsx locally
    const res = spawnSync('npx', ['tsx', filePath], { stdio: 'inherit', shell: true });
    if (res.status !== 0) {
        console.error(`❌ ${file} failed!`);
        failed++;
    } else {
        console.log(`✅ ${file} passed.\n`);
    }
}

if (failed > 0) {
    console.error(`\n❌ ${failed} tests failed.`);
    process.exit(1);
} else {
    console.log('\n✅ All tests passed.');
}
