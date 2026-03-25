import psycopg2
from psycopg2 import pool
import os
from typing import Optional
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor

Psycopg2Instrumentor().instrument()

db_pool: Optional[psycopg2.pool.SimpleConnectionPool] = None

def init_db_pool():
    global db_pool
    db_host = os.getenv('DB_HOST')
    kwargs = dict(
        host=db_host,
        database=os.getenv('DB_NAME'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD')
    )
    if not (db_host and db_host.startswith('/')):
        kwargs['port'] = os.getenv('DB_PORT', '5432')
    db_pool = psycopg2.pool.SimpleConnectionPool(1, 20, **kwargs)
    return db_pool

def close_db_pool():
    global db_pool
    if db_pool:
        db_pool.closeall()
        db_pool = None

def get_db_connection():
    if db_pool:
        return db_pool.getconn()
    return None

def return_db_connection(conn):
    if db_pool and conn:
        db_pool.putconn(conn)

def execute_query(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = False):
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            raise Exception("Database connection not available")

        cursor = conn.cursor()
        cursor.execute(query, params)

        if fetch_one:
            result = cursor.fetchone()
        elif fetch_all:
            result = cursor.fetchall()
        else:
            result = None

        conn.commit()
        cursor.close()
        return result
    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            return_db_connection(conn)