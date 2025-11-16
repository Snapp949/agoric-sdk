#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptPath = fileURLToPath(import.meta.url);
const bootDir = dirname(dirname(scriptPath));

// Run the benchmark
const benchmarkScript = join(
  bootDir,
  '..',
  'benchmark',
  'benchmark',
  'benchmark-stress-vaults.js',
);
const outputFile = join(bootDir, 'benchmark-stress-vaults-raw.json');

console.log('Running stress vaults benchmark...');
try {
  execFileSync('node', [benchmarkScript, '-o', outputFile], {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Benchmark failed:', error.message);
  process.exit(1);
}

// Read the benchmark output
const rawData = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

// Calculate avgPerVaultMs
// The benchmark creates 9 vaults per round (3 each for alice, bob, carol with size=3 default)
const vaultsPerRound = 9;
const benchmarkName = 'stress vaults';

if (!rawData[benchmarkName]) {
  console.error(`Benchmark "${benchmarkName}" not found in output`);
  process.exit(1);
}

const benchmarkData = rawData[benchmarkName];
const timePerRoundNs = benchmarkData.timePerRound;
const timePerRoundMs = timePerRoundNs / 1_000_000;
const avgPerVaultMs = timePerRoundMs / vaultsPerRound;

// Create output with the expected metric
const output = {
  avgPerVaultMs,
  rawBenchmarkData: rawData,
};

// Write the final output
const finalOutputFile = join(bootDir, 'benchmark-stress-vaults.json');
fs.writeFileSync(finalOutputFile, JSON.stringify(output, null, 2));

console.log(`Benchmark complete. Average time per vault: ${avgPerVaultMs.toFixed(3)}ms`);

// Clean up intermediate file
fs.unlinkSync(outputFile);
