"""
Development entry point — run from backend/:
    python run.py

Excludes data/ and logs/ from the file watcher so SQLite writes
don't spam "changes detected" in the console.
"""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8888,
        reload=True,
        reload_excludes=[
            "data/**",
            "logs/**",
            "*.db",
            "**/__pycache__/**",
        ],
    )
