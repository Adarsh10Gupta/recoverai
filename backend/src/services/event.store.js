const events = new Map();

const saveEvent = (eventId, event) => {
  if (events.has(eventId)) {
    return false;
  }

  events.set(eventId, event);

  return true;
};

const getEvent = (eventId) => {
  return events.get(eventId);
};

const getAllEvents = () => {
  return Array.from(events.values());
};

module.exports = {
  saveEvent,
  getEvent,
  getAllEvents,
};
