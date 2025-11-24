#!/usr/bin/env node
/**
 * Runs the vault stress benchmark and outputs results to benchmark-stress-vaults.json
 * 
 * This script runs the benchmark and extracts the avgPerVaultMs metric.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';

const TEMP_OUTPUT = 'benchmark-output.json';
const FINAL_OUTPUT = 'benchmark-stress-vaults.json';

try {
  console.log('Running vault stress benchmark...');
  
  // Run the benchmark with output to temp file
  execSync(
    `node benchmark-stress-vaults.js --output ${TEMP_OUTPUT} --vat-type local -c vaults 10`,
    { 
      stdio: 'inherit',
      cwd: process.cwd(),
    }
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
    avgPerVaultMs: avgPerVaultMs,
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
  
  // Clean up temp file
  unlinkSync(TEMP_OUTPUT);
  
} catch (error) {
  console.error('Error running benchmark:', error.message);
  process.exit(1);
}
