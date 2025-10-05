from openai import AzureOpenAI, BadRequestError, APITimeoutError
import os
from mimetypes import guess_type
import base64
from typing import List
import httpx
from PIL import Image
import io

endpoint = "https://oaigad.openai.azure.com/"
model_name = "gpt-4.1"
deployment = "gpt-4.1"
subscription_key = os.getenv("OPENAI_API_KEY")

api_version = "2024-12-01-preview"

client = None
if subscription_key:
    try:
        client = AzureOpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            azure_endpoint="https://oaigad.openai.azure.com/",
            api_version="2024-12-01-preview",
            max_retries=4,
            timeout=httpx.Timeout(60.0, read=90.0, write=60.0, pool=60.0)
        )
    except Exception as e:
        print(f"Warning: Failed to initialize Azure OpenAI client: {e}")


def _reduce_image_size_by_half(data_url: str) -> str:
    """
    Reduce an image data URL by 50% in both dimensions.
    Returns a new data URL with the reduced image.
    """
    try:
        if not data_url.startswith('data:'):
            return data_url
        
        header, base64_data = data_url.split(',', 1)
        mime_type = header.split(';')[0].replace('data:', '')
        
        img_bytes = base64.b64decode(base64_data)
        
        img = Image.open(io.BytesIO(img_bytes))
        
        new_width = max(1, img.width // 2)
        new_height = max(1, img.height // 2)
        img_resized = img.resize((new_width, new_height), Image.LANCZOS)
        
        if img_resized.mode in ("RGBA", "P"):
            img_resized = img_resized.convert("RGB")
        
        buffer = io.BytesIO()
        img_resized.save(buffer, format="JPEG", quality=85, optimize=True)
        reduced_bytes = buffer.getvalue()
        reduced_base64 = base64.b64encode(reduced_bytes).decode('utf-8')
        
        return f"data:image/jpeg;base64,{reduced_base64}"
    except Exception as e:
        print(f"Warning: Failed to reduce image size: {e}")
        return data_url


def get_response_from_chatgpt_simple(system_prompt: str, user_prompt: str, model: str) -> str:
    if client is None:
        return "API key not available"
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0
    )
    return response.choices[0].message.content


def get_response_from_chatgpt_with_functions(user_prompt: str, system_prompt: str, model: str, temperature: float, function_name: str, functions: List) -> str:
    if client is None:
        return "API key not available"
    
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=temperature,
        tools=functions,
        tool_choice={"type": "function", "function": {"name": function_name}}
    )
    return response.choices[0].message.tool_calls[0].function.arguments


def local_image_to_data_url(image_path: str) -> str:
    mime_type, _ = guess_type(image_path)
    if mime_type is None:
        mime_type = 'application/octet-stream'

    with open(image_path, "rb") as image_file:
        base64_encoded_data = base64.b64encode(image_file.read()).decode('utf-8')

    return f"data:{mime_type};base64,{base64_encoded_data}"


def get_response_from_chatgpt_image(system_prompt: str, user_prompt: str, image_path: str, model: str, pre_compiled_image = None) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_image is not None:
        image_data_url = pre_compiled_image
    else:
        image_data_url = local_image_to_data_url(image_path)
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
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
        except (APITimeoutError, httpx.TimeoutException) as e:
            if attempt < max_retries - 1:
                print(f"Timeout on attempt {attempt + 1}, reducing image size by 50% and retrying...")
                image_data_url = _reduce_image_size_by_half(image_data_url)
            else:
                raise Exception(f"Failed after {max_retries} retries with timeout: {e}")


def get_response_from_chatgpt_image_and_functions(system_prompt: str, user_prompt: str, image_path: str, model: str, functions: List, function_name: str, pre_compiled_image = None) -> str:
    if client is None:
        return "API key not available"
    
    if pre_compiled_image is not None:
        image_data_url = pre_compiled_image
    else:
        image_data_url = local_image_to_data_url(image_path)
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user_prompt},
                            {"type": "image_url", "image_url": {"url" : image_data_url}}
                        ]
                    }
                ],
                temperature=0,
                tools = functions,
                tool_choice = {"type": "function", "function": {"name": function_name}}
            )
            return response.choices[0].message.tool_calls[0].function.arguments
        except (APITimeoutError, httpx.TimeoutException) as e:
            if attempt < max_retries - 1:
                print(f"Timeout on attempt {attempt + 1}, reducing image size by 50% and retrying...")
                image_data_url = _reduce_image_size_by_half(image_data_url)
            else:
                raise Exception(f"Failed after {max_retries} retries with timeout: {e}")


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

    max_retries = 3
    for attempt in range(max_retries):
        try:
            content = [{"type": "text", "text": user_prompt}]
            for image_data_url in image_data_urls:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": image_data_url}
                })

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content}
                ],
                temperature=0,
                tools=functions,
                tool_choice={"type": "function", "function": {"name": function_name}}
            )
            return response.choices[0].message.tool_calls[0].function.arguments
        except (APITimeoutError, httpx.TimeoutException) as e:
            if attempt < max_retries - 1:
                print(f"Timeout on attempt {attempt + 1}, reducing all images by 50% and retrying...")
                image_data_urls = [_reduce_image_size_by_half(url) for url in image_data_urls]
            else:
                raise Exception(f"Failed after {max_retries} retries with timeout: {e}")


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

    max_retries = 3
    for attempt in range(max_retries):
        try:
            content = [{"type": "text", "text": user_prompt}]
            for image_data_url in image_data_urls:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": image_data_url}
                })

            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": content}
                ],
                temperature=0
            )
            return response.choices[0].message.content
        except (APITimeoutError, httpx.TimeoutException) as e:
            if attempt < max_retries - 1:
                print(f"Timeout on attempt {attempt + 1}, reducing all images by 50% and retrying...")
                image_data_urls = [_reduce_image_size_by_half(url) for url in image_data_urls]
            else:
                raise Exception(f"Failed after {max_retries} retries with timeout: {e}")


def get_markdown_schema():
    """
    Returns a schema that demands a single markdown string response.
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "provide_markdown_response",
                "description": "Provide your response as a markdown-formatted string",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "markdown_response": {
                            "type": "string",
                            "description": "The complete response formatted in markdown"
                        }
                    },
                    "required": ["markdown_response"],
                    "additionalProperties": False
                }
            }
        }
    ]


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
