const db = require("../db/database");

const log = async ({
  entityType,
  entityId,
  action,
  actor = "system",
  metadata = {},
}) => {
  await db.query(
    `
    INSERT INTO audit_logs (
      entity_type,
      entity_id,
      action,
      actor,
      metadata
    )
    VALUES ($1,$2,$3,$4,$5)
    `,
    [
      entityType,
      entityId || null,
      action,
      actor,
      metadata,
    ]
  );
};


module.exports = {
  log,
};
