async function buildQueueMetrics(fastify) {

  const metrics = [];

  const queues = [
    {
      name: "induct_shipment_queue",
      queue: fastify.queues.inductApiQueue
    },
    {
      name: "notify_drop_item_queue",
      queue: fastify.queues.dropNotificationQueue
    },
    {
      name: "sort_engine_queue",
      queue: fastify.queues.sortEngineQueue
    },
    {
      name: "confirm_sort_queue",
      queue: fastify.queues.confirmSortQueue
    },
    {
      name: "bag_close_queue",
      queue: fastify.queues.bagCloseQueue
    },
    {
      name: "bulk_data_queue",
      queue: fastify.queues.bulkDataQueue
    },
    {
      name: "cleanup_queue",
      queue: fastify.queues.cleanUpQueue
    }
  ];

  for (const item of queues) {

    const counts = await item.queue.getJobCounts();

    const waiting =
      counts.waiting + counts.delayed + counts["waiting-children"];

    const failed = counts.failed;

    const active = counts.active;

    metrics.push({
      type: "QUEUE",
      name: `${item.name}.consumers`,
      value: String(active),
      measure: "count"
    });

    metrics.push({
      type: "QUEUE",
      name: `${item.name}.queue_lag`,
      value: String(waiting),
      measure: "count"
    });

    metrics.push({
      type: "QUEUE",
      name: `${item.name}.sideline_count`,
      value: String(failed),
      measure: "count"
    });

    // TODO
    metrics.push({
      type: "QUEUE",
      name: `${item.name}.produced_rate`,
      value: "0",
      measure: "rps"
    });

    metrics.push({
      type: "QUEUE",
      name: `${item.name}.consumed_rate`,
      value: "0",
      measure: "rps"
    });

    metrics.push({
      type: "QUEUE",
      name: `${item.name}.sideline_rate`,
      value: "0",
      measure: "rps"
    });

  }

  return metrics;

}

module.exports = {
  buildQueueMetrics
};