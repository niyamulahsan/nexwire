let requestCount = 0;
let errorCount = 0;

export function incrementRequestCount() {
  requestCount++;
}

export function incrementErrorCount() {
  errorCount++;
}

export function resetMetrics() {
  requestCount = 0;
  errorCount = 0;
}

export function getMetrics() {
  return {
    requestCount,
    errorCount
  };
}
