const { Worker, Queue } = require("bullmq");
const redisConnection = require("../config/redisConnection");
const logRecorder = require("../utils/logger")
const fp = require('fastify-plugin')

const BATCH_SIZE = 200;

const cleanUpWorker = async (fastify) => {
    try {
        const endTime = Date.now() + 60 * 60 * 1000;
        await fastify.pg.query("SELECT 1");

        logRecorder.error({message : `✅ Cleanup Worker Connected To PostgreSQL`});

        const worker = new Worker(
            "data-cleanup",
            async (job) => {
                try {
                    // console.log(
                    //     `Cleanup Started | JobId=${job.id}`
                    // );
                    const TABLES = [
                        {
                            table: "primary_bin_data",
                            dateColumn: "created_at",
                            pkId: "id"
                        },
                        {
                            table: "sorted_bulk_data",
                            dateColumn: "moved_at",
                            pkId: "item_id"
                        },
                        {
                            table: "bulk_data",
                            dateColumn: "received_at",
                            pkId: "item_id"
                        },
                        {
                            table: "bag_closing",
                            dateColumn: "bag_closed_at",
                            pkId: "id"
                        },
                        {
                            table: "previous_bulk_data",
                            dateColumn: "replaced_at",
                            pkId: "id"
                        },
                    ];
                    for (const { table, pkId, dateColumn } of TABLES) {

                        if (Date.now() >= endTime) {
                            // console.log("⏰ 1 hour reached. Stopping cleanup.");
                            break;
                        }

                        let deletedRows = 0;

                        do {

                            if (Date.now() >= endTime) {
                                // console.log("⏰ 1 hour reached. Stopping cleanup.");
                                return;
                            }

                            const query = `
                            DELETE FROM ${table}
                            WHERE ${pkId} IN (
                                SELECT ${pkId}
                                FROM ${table}
                                WHERE ${dateColumn} < NOW() - INTERVAL '14 days'
                                LIMIT ${BATCH_SIZE}
                            )
                            `;

                            const result = await fastify.pg.query(query);
                            deletedRows = result.rowCount;

                            if (deletedRows > 0) {
                                // console.log(`🗑️ ${table}: deleted ${deletedRows} rows`);
                                logRecorder.error({message : `🗑️ ${table}: deleted ${deletedRows} rows`})
                                await new Promise(resolve => setTimeout(resolve, 200));
                            }

                        } while (deletedRows > 0);
                    }


                    // console.log(
                    //     `🎉 Cleanup Finished | JobId=${job.id}`
                    // );
                    logRecorder.error({message : `🎉 Cleanup Finished | JobId=${job.id}`})
                } catch (err) {
                    // console.error(
                    //     "❌ Cleanup Execution Error",
                    //     err
                    // );
                    logRecorder.error({message : `❌ Cleanup Execution Error`,err : err})

                    throw err;
                }
            },
            {
                connection: {
                    ...redisConnection,
                    maxRetriesPerRequest: null,
                },
                concurrency: 1,
            }
        );

        worker.on("completed", (job) => {
            // console.log(
            //     `✅ Job Completed | JobId=${job.id}`
            // );
            logRecorder.error({message : `✅ Job Completed | JobId=${job.id}`})
        });

        worker.on("failed", (job, err) => {
            // console.error(
            //     `❌ Job Failed | JobId=${job?.id}`,
            //     err
            // );
            logRecorder.error({message : `❌ Job Failed | JobId=${job?.id}`,err})
        });

        worker.on("error", (err) => {
            // console.error(
            //     "❌ Worker Error",
            //     err
            // );
            logRecorder.error({message : `❌ Worker Error`,err})
        });

        worker.on("ready", () => {
            // console.log(
            //     "✅ Cleanup BullMQ Worker Ready"
            // );
            logRecorder.error({message : `✅ Cleanup BullMQ Worker Ready`})
        });

        // console.log(
        //     "✅ Cleanup Worker Started Successfully"
        // );
        logRecorder.error({message : `✅ Cleanup Worker Started Successfully"`})
    } catch (err) {
        // console.error(
        //     "❌ Failed To Start Cleanup Worker",
        //     err
        // );
        logRecorder.error({message : `❌ Failed To Start Cleanup Worker`,err})
    }
};

module.exports = fp(cleanUpWorker)