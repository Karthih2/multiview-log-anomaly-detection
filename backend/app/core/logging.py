import logging


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    # The embedding model lookup logs one line per HTTP request; keep only problems.
    logging.getLogger("httpx").setLevel(logging.WARNING)
