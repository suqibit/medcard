"""Vercel Serverless 入口：把 Flask app 暴露为 WSGI 应用。

@vercel/python builder 会查找名为 `app` 或 `handler` 的对象，
这里两者都导出以保证兼容。
"""

from app import app as application

app = application
handler = application
