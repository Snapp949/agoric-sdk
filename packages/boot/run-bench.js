#!/usr/bin/env node
/**
 * Runs the vault stress benchmark and outputs results to benchmark-stress-vaults.json
 *
 * This script runs the benchmark from packages/benchmark and extracts the avgPerVaultMs metric.
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);

const TEMP_OUTPUT = 'benchmark-output.json';
const FINAL_OUTPUT = 'benchmark-stress-vaults.json';
const BENCHMARK_SCRIPT = join(
  __dirname,
  '..',
  'benchmark',
  'benchmark',
  'benchmark-stress-vaults.js',
);

try {
  console.log('Running vault stress benchmark...');

  // Run the benchmark with output to temp file
  execFileSync(
    'node',
    [
      BENCHMARK_SCRIPT,
      '--output',
      TEMP_OUTPUT,
      '--vat-type',
      'local',
      '-c',
      'vaults',
      '10',
    ],
    {
      stdio: 'inherit',
      cwd: process.cwd(),
    },
  );

  // Read the benchmark output
  const benchmarkData = JSON.parse(readFileSync(TEMP_OUTPUT, 'utf8'));

  // Extract the stress vaults benchmark results
  const stressVaultsData = benchmarkData['stress vaults'];

  if (!stressVaultsData) {
    console.error('Error: "stress vaults" benchmark data not found in output');
    process.exit(1);
  }

  // Calculate avgPerVaultMs
  // timePerRound is in nanoseconds, convert to milliseconds
  const timePerRoundMs = stressVaultsData.timePerRound / 1_000_000;
  const vaultsPerRound = 10; // From the -c vaults 10 option
  const avgPerVaultMs = timePerRoundMs / vaultsPerRound;

  // Create the output format expected by the workflow
  const output = {
    avgPerVaultMs,
    timePerRound: stressVaultsData.timePerRound,
    rounds: stressVaultsData.rounds,
    cranks: stressVaultsData.cranks,
    cranksPerRound: stressVaultsData.cranksPerRound,
    vaultsPerRound,
  };

  // Write the final output
  writeFileSync(FINAL_OUTPUT, JSON.stringify(output, null, 2));

  console.log(`\nBenchmark complete!`);
  console.log(`Average time per vault: ${avgPerVaultMs.toFixed(3)}ms`);
  console.log(`Results written to ${FINAL_OUTPUT}`);
} catch (error) {
  console.error('Error running benchmark:', error.message);
  process.exit(1);
} finally {
  // Clean up temp file if it exists
  if (existsSync(TEMP_OUTPUT)) {
    unlinkSync(TEMP_OUTPUT);
  }
}
