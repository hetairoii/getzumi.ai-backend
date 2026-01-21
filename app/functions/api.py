from mangum import Mangum
from app.main import app

# Este es el punto de entrada que Netlify/AWS Lambda ejecutará
handler = Mangum(app, lifespan="off")