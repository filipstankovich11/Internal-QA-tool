const domain = import.meta.env.VITE_GORGIAS_DOMAIN || 'gorgias.gorgias.com'
export const gorgiasTicketUrl = (ticketId) => `https://${domain}/app/ticket/${ticketId}`
