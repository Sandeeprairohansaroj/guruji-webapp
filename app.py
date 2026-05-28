import os
from flask import Flask, request, jsonify, render_template
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Load configuration from .env file
ENDPOINT = os.getenv("AZURE_ENDPOINT", "https://aisandy.services.ai.azure.com/openai/v1/")
API_KEY = os.getenv("AZURE_API_KEY", "")
DEPLOYMENT_NAME = os.getenv("AZURE_DEPLOYMENT_NAME", "Kimi-K2.6")

# Initialize OpenAI client with Azure AI Foundry endpoint
client = OpenAI(
    base_url=ENDPOINT,
    api_key=API_KEY
)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/chat", methods=["POST"])
def chat():
    try:
        data = request.get_json()
        messages = data.get("messages", [])
        
        if not messages:
            return jsonify({"error": "No messages provided"}), 400
        
        completion = client.chat.completions.create(
            model=DEPLOYMENT_NAME,
            messages=messages,
            temperature=0.7,
            max_tokens=2000,
        )
        
        reply = completion.choices[0].message.content
        return jsonify({"response": reply})
    
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Open in browser automatically
    import webbrowser
    from threading import Timer
    
    def open_browser():
        webbrowser.open("http://127.0.0.1:5000/")
    
    Timer(1.5, open_browser).start()
    print("Starting Guruji Web App...")
    print("Opening browser at http://127.0.0.1:5000/")
    
    app.run(host="0.0.0.0", port=5000, debug=False)
