const Monitoring = require('@google-cloud/monitoring');

// Check if GCP_CREDENTIALS is set
if (!process.env.GCP_CREDENTIALS || process.env.GCP_CREDENTIALS.trim() === '') {
  console.log('GCP_CREDENTIALS not set. Metrics module will not be functional.');
  // Export stub functions since this is a module
  module.exports = {
    sendMetricsToGCP: async () => {
      console.log('GCP_CREDENTIALS not configured. Skipping metrics.');
    },
    makeTimeSeries: () => [],
  };
  return;
}

let gcpCredentials;
try {
  gcpCredentials = JSON.parse(process.env.GCP_CREDENTIALS);
} catch (error) {
  console.error('Failed to parse GCP_CREDENTIALS:', error.message);
  console.log('Metrics module will not be functional due to invalid GCP_CREDENTIALS.');
  // Export stub functions since this is a module
  module.exports = {
    sendMetricsToGCP: async () => {
      console.log('GCP_CREDENTIALS invalid. Skipping metrics.');
    },
    makeTimeSeries: () => [],
  };
  return;
}
const projectId = gcpCredentials.project_id;

const monitoring = new Monitoring.MetricServiceClient({
  projectId: gcpCredentials.project_id,
  credentials: {
    client_email: gcpCredentials.client_email,
    private_key: gcpCredentials.private_key,
  },
});

async function sendMetricsToGCP(timeSeries) {
  const batchSize = 200;
  for (let i = 0; i < timeSeries.length; i += batchSize) {
    const batch = timeSeries.slice(i, i + batchSize);
    const request = {
      name: monitoring.projectPath(projectId),
      timeSeries: batch,
    };

    try {
      await monitoring.createTimeSeries(request);
      console.log(
        `Batch starting with metric ${batch[0].metric.type} sent successfully.`,
      );
    } catch (error) {
      console.error('Error sending batch:', error);
    }
  }
}

function makeTimeSeries(testData) {
  const timeSeries = testData.map(({ labels, value }) => ({
    metric: {
      type: `custom.googleapis.com/github/test-results`,
      labels,
    },
    resource: {
      type: 'global',
      labels: {
        project_id: projectId,
      },
    },
    points: [
      {
        interval: {
          endTime: {
            seconds: Math.floor(Date.now() / 1000),
          },
        },
        value: {
          doubleValue: value,
        },
      },
    ],
  }));
  return timeSeries;
}

module.exports = { sendMetricsToGCP, makeTimeSeries };
