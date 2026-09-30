**Create the tickets.** Create the pieces in order with `{skill:create-ticket}`. With three or more pieces, pass `--parent` naming the originating ticket. For a piece that depends on an earlier piece landing first, pass `--blocked-by` naming that piece's reference, which exists by then.

**Rewrite the originating ticket.** Write the originating ticket's new body per the platform-specific write in [ticket source resolution](../_data/ticket-source-resolution.md#platform-specific-write).
