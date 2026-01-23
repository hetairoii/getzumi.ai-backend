
async function listModels() {
    // Manually read .env since we can't use dotenv
    const fs = require('fs');
    try {
        const envConfig = fs.readFileSync('.env', 'utf8');
        for (const line of envConfig.split('\n')) {
            const [key, value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.trim();
            }
        }
    } catch (e) {
        console.log("Could not read .env file");
    }

    const apiKey = process.env.APIYI_API_KEY;
    const baseUrl = process.env.APIYI_BASE_URL || "https://api.apiyi.com";
    
    if (!apiKey) {
        console.error("No API Key found");
        return;
    }

    try {
        const res = await fetch(`${baseUrl}/v1/models`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });
        
        if (!res.ok) {
            console.error("Error listing models:", await res.text());
            return;
        }

        const data = await res.json();
        console.log("Available Models:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}

listModels();
