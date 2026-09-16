export const agendaRefreshEvent = "braid:agenda-refresh";

export function requestAgendaRefresh() {
  window.dispatchEvent(new Event(agendaRefreshEvent));
}
