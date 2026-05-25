const db = require('./db');

function getRoute(slug) {
  const a = db.getApp(slug);
  if (!a || !a.active) return null;
  return {
    agent: a.agent,
    url: a.ticket_url,
    mission: a.mission,
    lot: a.lot,
    wave: a.wave,
    skip: !!a.skip,
    configured: !!a.configured
  };
}

module.exports = {
  getRoute,
  listApps: db.listApps
};
