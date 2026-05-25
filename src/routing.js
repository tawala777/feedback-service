require('dotenv').config();

module.exports = {
  'bookingsExtApi': { agent: 'candy', url: 'http://localhost:4000/api/tickets' },
  'team-tracker': { agent: 'candy', url: 'http://localhost:4000/api/tickets' },
  'aam-website': { agent: 'candy', url: 'http://localhost:4000/api/tickets' },
  'stats-v1': { agent: 'sandy', url: process.env.SANDY_TICKETS_URL || null, mission: 'user-feedback', lot: 0, wave: 4 },
  'hotel-aggregator': { agent: 'sandy', url: process.env.SANDY_TICKETS_URL || null, mission: 'user-feedback', lot: 0, wave: 4 }
};
