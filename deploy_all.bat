gcloud run services update quickaishort-api --region=us-central1 --project=quickaishort-agent --env-vars-file="fastapi/env.yaml"
gcloud run deploy quickaishort-api --source="fastapi" --region=us-central1 --project=quickaishort-agent --allow-unauthenticated --memory=2Gi --cpu=2 --timeout=300 --quiet
gcloud run services update quickaishort-api --region=us-central1 --project=quickaishort-agent --env-vars-file="fastapi/env.yaml"
gcloud run deploy quickaishort-worker --source="fastapi" --region=us-central1 --project=quickaishort-agent --no-allow-unauthenticated --memory=4Gi --cpu=4 --timeout=900 --concurrency=1 --command=python --args=render_worker.py --quiet
gcloud run services update quickaishort-worker --region=us-central1 --project=quickaishort-agent --env-vars-file="fastapi/env-worker.yaml"
