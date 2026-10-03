#!/usr/bin/env bash
# Differential validation of the CassLab engine against Apache Cassandra 5.0.
# Requirements: git, JDK 11+, Node.js 18+, TypeScript (npx tsc).
set -euo pipefail
cd "$(dirname "$0")"
CASSANDRA_COMMIT=de8fe4b5d931c37a261912e11d994a6a45c9ef7e   # branch cassandra-5.0, 2026-09-25

if [ ! -f build/CassandraReference.class ]; then
  rm -rf .cassandra-src build && mkdir -p build
  git clone -q --filter=blob:none --no-checkout https://github.com/apache/cassandra.git .cassandra-src
  git -C .cassandra-src sparse-checkout set --no-cone /src/java/org/apache/cassandra/utils/MurmurHash.java
  git -C .cassandra-src checkout -q "$CASSANDRA_COMMIT"
  mkdir -p reference/org/apache/cassandra/utils
  cp .cassandra-src/src/java/org/apache/cassandra/utils/MurmurHash.java reference/org/apache/cassandra/utils/   # unmodified
  javac -d build $(find reference -name '*.java')
fi

(cd .. && npx tsc -p tsconfig.test.json && node -e "require('fs').writeFileSync('.test-build/package.json','{\"type\":\"commonjs\"}')")
node harness.cjs ../.test-build validation-report.json > /dev/null
node -e "const r=JSON.parse(require('fs').readFileSync('validation-report.json','utf8'));const p=(o)=>o.match+'/'+o.cases;
console.log('Token computation  ascii', p(r.hashing.text_ascii), '| non-ascii', p(r.hashing.text_non_ascii), '| int', p(r.hashing.int), '| composite', p(r.hashing.composite_text_int));
console.log('Replica placement ', r.placement.setMatch+'/'+r.placement.cases, 'sets,', r.placement.orderMatch+'/'+r.placement.cases, 'ordered, over', r.placement.clusters, 'clusters');
console.log('Coordinator/primary', r.coordinator.primaryMatch+'/'+r.coordinator.cases);
console.log('Consistency        blockFor', r.consistency.blockForMatch+'/'+r.consistency.cases, '| availability', r.consistency.availMatch+'/'+r.consistency.cases);
console.log('Ownership          max abs error', r.ownership.maxAbsErrPct, '%');
console.log('Rebalancing       ', JSON.stringify(r.rebalancing));
console.log('Mismatch examples ', r.examples.length);"
