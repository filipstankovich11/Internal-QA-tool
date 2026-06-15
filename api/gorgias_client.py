import time
import requests
from typing import Optional


class GorgiasClient:
    def __init__(self, domain: str, auth_header: str):
        self.base_url = f"https://{domain}/api"
        self.headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
        }

    def _get(self, path: str, params: dict = None, retries: int = 4) -> dict:
        url = f"{self.base_url}{path}"
        for attempt in range(retries):
            response = requests.get(url, headers=self.headers, params=params, timeout=30)
            if response.status_code == 429:
                wait = int(response.headers.get("Retry-After", 10)) + 2
                print(f"  Rate limited — waiting {wait}s before retry...")
                time.sleep(wait)
                continue
            response.raise_for_status()
            return response.json()
        response.raise_for_status()

    def list_tickets(self, limit: int = 10, cursor: Optional[str] = None) -> dict:
        params = {"limit": limit, "order_by": "created_datetime:desc"}
        if cursor:
            params["cursor"] = cursor
        return self._get("/tickets", params=params)

    def get_ticket(self, ticket_id: int) -> dict:
        return self._get(f"/tickets/{ticket_id}")

    def get_ticket_messages(self, ticket_id: int) -> list[dict]:
        """Fetch all messages for a ticket, handling pagination."""
        messages = []
        cursor = None

        while True:
            params = {
                "ticket_id": ticket_id,
                "limit": 100,
                "order_by": "created_datetime:asc",
            }
            if cursor:
                params["cursor"] = cursor

            data = self._get("/messages", params=params)
            messages.extend(data.get("data", []))

            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            cursor = next_cursor

        return messages

    def list_tickets_by_agent(self, gorgias_user_id: int, date_from: str = None, date_to: str = None, max_tickets: int = 300) -> list[dict]:
        """Fetch tickets assigned to a specific agent, optionally within a date range."""
        tickets = []
        cursor = None
        while len(tickets) < max_tickets:
            params = {
                'limit': 100,
                'order_by': 'created_datetime:desc',
                'assignee_user_id': gorgias_user_id,
            }
            if date_from:
                params['created_datetime[0][after]'] = f'{date_from}T00:00:00+00:00'
            if date_to:
                params['created_datetime[0][before]'] = f'{date_to}T23:59:59+00:00'
            if cursor:
                params['cursor'] = cursor
            data = self._get('/tickets', params=params)
            batch = data.get('data', [])
            tickets.extend(batch)
            cursor = data.get('meta', {}).get('next_cursor')
            if not cursor or len(batch) < 100:
                break
        return tickets[:max_tickets]

