from motor.motor_asyncio import AsyncIOMotorClient


class MongoClientManager:
    _client: AsyncIOMotorClient | None = None

    @classmethod
    def get_client(cls, uri: str) -> AsyncIOMotorClient:
        if cls._client is None:
            cls._client = AsyncIOMotorClient(uri)
        return cls._client

    @classmethod
    def get_database(cls, uri: str, db_name: str):
        client = cls.get_client(uri)
        return client[db_name]