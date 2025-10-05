from openai import AzureOpenAI, BadRequestError  # Import the AzureOpenAI module from the OpenAI library
import os  # Import the OS module to access environment variables
from mimetypes import guess_type
import base64
from typing import List
import httpx

# Initialize the AzureOpenAI client with the necessary details
endpoint = "https://oaigad.openai.azure.com/"
model_name = "gpt-4.1"
deployment = "gpt-4.1"
subscription_key = os.getenv("OPENAI_API_KEY")

api_version = "2024-12-01-preview"

# Initialize client only if API key is available
client = None
if subscription_key:
    try:
        client = AzureOpenAI(
            api_key=subscription_key,
            azure_endpoint=endpoint,
            api_version=api_version,
            # Separate connect/read/write timeouts so uploads & long generations don’t trip:
            timeout=httpx.Timeout(connect=10.0, read=180.0, write=180.0, pool=10.0),
            max_retries=1,  # optional: keep this low for vision posts
            http_client=httpx.Client(http2=False)  # optional: avoids flaky corporate proxies
        )
    except Exception as e:
        print(f"Warning: Failed to initialize Azure OpenAI client: {e}")

# Function to get a response from ChatGPT with a simple system and user prompt
def get_response_from_chatgpt_simple(system_prompt: str, user_prompt: str, model: str) -> str:
    if client is None:
        return "API key not available"
    
    response = client.chat.completions.create(
        model=model,  # The model name to be used
        messages=[
            {"role": "system", "content": system_prompt},  # System prompt that guides the model's behavior
            {"role": "user", "content": user_prompt}  # User input to which the model will respond
        ],
        temperature=0  # Setting temperature to 0 makes responses more deterministic
    )
    return response.choices[0].message.content  # Extract and return the model's response

# Function to get a response from ChatGPT, with more flexibility over inputs.
#`functions` and `function_name` allow us to specify a precise format we want the response in.
def get_response_from_chatgpt_with_functions(user_prompt: str, system_prompt: str, model: str, temperature: float, function_name: str, functions: List) -> str:
    if client is None:
        return "API key not available"
    
    response = client.chat.completions.create(
        model=model,  # The model name to be used
        messages=[
            {"role": "system", "content": system_prompt},  # System prompt that guides the model's behavior
            {"role": "user", "content": user_prompt}  # User input to which the model will respond
        ],
        temperature=temperature,  # Controls randomness in responses (higher values make responses more varied)
        tools=functions,
        tool_choice={"type": "function", "function": {"name": function_name}}
    )
    return response.choices[0].message.tool_calls[0].function.arguments


# Function to encode a local image into data URL
# From https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/gpt-with-vision?tabs=python
def local_image_to_data_url(image_path: str) -> str:
    # Guess the MIME type of the image based on the file extension
    mime_type, _ = guess_type(image_path)
    if mime_type is None:
        mime_type = 'application/octet-stream'  # Default MIME type if none is found

    # Read and encode the image file
    with open(image_path, "rb") as image_file:
        base64_encoded_data = base64.b64encode(image_file.read()).decode('utf-8')

    # Construct the data URL
    return f"data:{mime_type};base64,{base64_encoded_data}"

def get_response_from_chatgpt_image(system_prompt: str, user_prompt: str, image_path: str, model: str, pre_compiled_image = None) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_image is not None:
        image_data_url = pre_compiled_image
    else:
        image_data_url = local_image_to_data_url(image_path)
    
    create_params = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt},
                    {"type": "image_url", "image_url": {"url" : image_data_url}}
                ]
            }
        ],
        "temperature": 0
    }
    
    response = client.chat.completions.create(**create_params)
    return response.choices[0].message.content


def get_response_from_chatgpt_image_and_functions(system_prompt: str, user_prompt: str, image_path: str, model: str, functions: List, function_name: str, pre_compiled_image = None) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_image is not None:
        image_data_url = pre_compiled_image
    else:
        image_data_url = local_image_to_data_url(image_path)
    response = client.chat.completions.create(
        model=model, # This needs to be a vision enabled model
        messages=[
            {"role": "system", "content": system_prompt},  # System prompt that guides the model's behavior
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_prompt}, # User input to which the model will respond
                    {"type": "image_url", "image_url": {"url" : image_data_url}}
                ]
            }
        ],
        temperature=0,  # Setting temperature to 0 makes responses more deterministic
        tools = functions,
        tool_choice = {"type": "function", "function": {"name": function_name}},
        timeout = 10

    )
    return response.choices[0].message.tool_calls[0].function.arguments


def get_response_from_chatgpt_multiple_image_and_functions(
    system_prompt: str,
    user_prompt: str,
    image_paths: List,
    model: str,
    functions: List,
    function_name: str,
    pre_compiled_images=None
) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_images is not None:
        image_data_urls = pre_compiled_images
    else:
        image_data_urls = [local_image_to_data_url(path) for path in image_paths]

    # Construct the content array with text and multiple images
    content = [{"type": "text", "text": user_prompt}]
    for image_data_url in image_data_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": image_data_url}
        })

    response = client.chat.completions.create(
        model=model,  # Ensure this is a vision-enabled model
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ],
        temperature=0,
        tools=functions,
        tool_choice={"type": "function", "function": {"name": function_name}}
    )
    return response.choices[0].message.tool_calls[0].function.arguments



def get_response_from_chatgpt_multiple_image(
    system_prompt: str,
    user_prompt: str,
    image_paths: List,
    model: str,
    pre_compiled_images=None
) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_images is not None:
        image_data_urls = pre_compiled_images
    else:
        image_data_urls = [local_image_to_data_url(path) for path in image_paths]

    # Construct the content array with text and multiple images
    content = [{"type": "text", "text": user_prompt}]
    for image_data_url in image_data_urls:
        content.append({
            "type": "image_url",
            "image_url": {"url": image_data_url}
        })

    response = client.chat.completions.create(
        model=model,  # Ensure this is a vision-enabled model
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": content}
        ],
        temperature=0
    )
    return response.choices[0].message.content

def get_embedding(text: str, model = "text-embedding-3-large"):
    if client is None:
        return []
    
    try:
        response = client.embeddings.create(
            model=model,
            input=text
        )
    except BadRequestError:
        return []

    return response.data[0].embedding
