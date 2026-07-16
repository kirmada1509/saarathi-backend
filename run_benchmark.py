import json
import urllib.request
import urllib.error
import sys

def run_benchmark():
    try:
        with open('data/benchmark_prompts.json', 'r', encoding='utf-8') as f:
            prompts = json.load(f)
    except FileNotFoundError:
        print("Error: data/benchmark_prompts.json not found.", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print("Error: data/benchmark_prompts.json is not valid JSON.", file=sys.stderr)
        sys.exit(1)

    api_url = "http://localhost:4000/recommend"
    
    successes = 0
    failures = 0
    total = len(prompts)

    print(f"Starting benchmark execution for {total} prompts...")
    print()

    try:
        for item in prompts:
            prompt_id = item.get("prompt_id")
            user_id = item.get("user_id")
            request_text = item.get("request")

            print("-" * 60)
            print(f"Running Prompt {prompt_id} for User {user_id}")
            print(f"Request: {request_text}")
            print("-" * 60)

            payload = {
                "userId": user_id,
                "requestText": request_text
            }
            data = json.dumps(payload).encode('utf-8')

            req = urllib.request.Request(
                api_url,
                data=data,
                headers={'Content-Type': 'application/json'}
            )

            try:
                with urllib.request.urlopen(req) as response:
                    res_body = response.read().decode('utf-8')
                    result = json.loads(res_body)

                    verdict = result.get("verdict")
                    mode = result.get("mode")
                    explanation = result.get("explanation")

                    print(f"Mode: {mode}")
                    if verdict:
                        price = verdict.get('price')
                        formatted_price = f"${price:.2f}" if isinstance(price, (int, float)) else str(price)
                        print(f"Top Recommendation: {verdict.get('airline_name')} {verdict.get('flight_numbers')} ({formatted_price})")
                    else:
                        print("Top Recommendation: None")
                    if explanation:
                        print(f"AI Explanation: {explanation}")
                    
                    successes += 1
            except urllib.error.HTTPError as e:
                failures += 1
                try:
                    error_body = e.read().decode('utf-8')
                    print(f"HTTP Error {e.code}: {error_body}", file=sys.stderr)
                except Exception:
                    print(f"HTTP Error {e.code}", file=sys.stderr)
            except urllib.error.URLError as e:
                failures += 1
                print(f"URL Error: {e.reason}. Is the backend server running on port 4000?", file=sys.stderr)
                print("\nServer appears to be offline. Exiting benchmark.", file=sys.stderr)
                break
            except Exception as e:
                failures += 1
                print(f"Unexpected error: {str(e)}", file=sys.stderr)
            print()

    except KeyboardInterrupt:
        print("\n\nExecution interrupted by user. Exiting gracefully...", file=sys.stderr)

    # Print final summary stats
    processed = successes + failures
    print("=" * 60)
    print("Benchmark Execution Summary")
    print("=" * 60)
    print(f"Total Prompts:      {total}")
    print(f"Processed Prompts:  {processed}")
    print(f"Successful Calls:   {successes}")
    print(f"Failed Calls:       {failures}")
    if processed > 0:
        success_rate = (successes / processed) * 100
        print(f"Success Rate:       {success_rate:.1f}%")
    print("=" * 60)

    # Exit code indicates if any failures occurred
    if failures > 0 or processed < total:
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    run_benchmark()
