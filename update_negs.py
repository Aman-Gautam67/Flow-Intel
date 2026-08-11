import os

path = r"D:\PROJECTS\Site\work-flow-intel\src\lib\qa\fixtures\negative-fixtures.ts"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

new_negs = """
  {
    id: "n8n-prv-keywords-clean",
    platform: "n8n",
    label: "Safe n8n workflow with keywords like Images, Storage, average, package, usage",
    cleanReason: "Legitimate node names and parameters, no PII.",
    workflow: {
      name: "Image Storage Package",
      nodes: [
        {
          id: "node-1", name: "Images Storage",
          type: "n8n-nodes-base.code", typeVersion: 2,
          position: [200, 300],
          parameters: { jsCode: "const package = 'usage'; const average = 5; return items;" }
        }
      ]
    }
  },
  {
    id: "n8n-http-safe-auth",
    platform: "n8n",
    label: "HTTP node with proper auth and error handling",
    cleanReason: "Has authentication and continueOnFail",
    workflow: {
      name: "Safe HTTP",
      nodes: [
        {
          id: "node-2", name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest", typeVersion: 4,
          position: [200, 300],
          parameters: { url: "https://api.example.com", authentication: "predefinedCredentialType" },
          credentials: { httpHeaderAuth: { id: "cred-1", name: "My Auth" } },
          onError: "continueErrorOutput"
        }
      ]
    }
  },
  {
    id: "make-safe-params",
    platform: "make",
    label: "Make workflow with legitimate parameters",
    cleanReason: "Safe params",
    workflow: {
      name: "Make Flow",
      nodes: [
        {
          id: "node-3", name: "Make HTTP",
          type: "make.http:ActionSendData",
          position: [200, 300],
          parameters: { url: "https://api.example.com" },
          credentials: { id: "cred-1" }
        }
      ]
    }
  },
  {
    id: "zapier-multi-step",
    platform: "zapier",
    label: "Zapier multi-step clean",
    cleanReason: "No PII, normal steps",
    workflow: {
      name: "Zapier Flow",
      nodes: [
        {
          id: "node-4", name: "Zap Trigger",
          type: "zapier.scheduleapi.read",
          position: [200, 300],
          parameters: {}
        },
        {
          id: "node-5", name: "Zap Action",
          type: "zapier.slackapi.write",
          position: [400, 300],
          parameters: {}
        }
      ]
    }
  },
  {
    id: "flowise-rag-safe",
    platform: "flowise",
    label: "Flowise RAG proper settings",
    cleanReason: "Standard RAG components",
    workflow: {
      name: "RAG",
      nodes: [
        {
          id: "node-6", name: "LLM",
          type: "flowise.llmChain",
          position: [200, 300],
          parameters: {}
        }
      ]
    }
  },
"""

for i in range(7, 17):
    new_negs += f"""
  {{
    id: "generic-scale-{i}",
    platform: "generic",
    label: "Generic node {i}",
    cleanReason: "Just testing scale {i}",
    workflow: {{
      name: "Scale {i}",
      nodes: [
"""
    for j in range(15):
        new_negs += f"""
        {{
          id: "node-{i}-{j}", name: "Node {j}",
          type: "generic.node",
          position: [{j*100}, 300],
          parameters: {{}}
        }},
"""
    new_negs += """
      ]
    }
  },
"""

new_negs += """
  {
    id: "airflow-dag-clean",
    platform: "airflow",
    label: "Airflow DAG",
    cleanReason: "Safe DAG",
    workflow: {
      name: "Airflow DAG",
      nodes: [ { id: "task-1", type: "airflow.bash", parameters: { command: "echo hello" } } ]
    }
  },
  {
    id: "prefect-flow-clean",
    platform: "prefect",
    label: "Prefect Flow",
    cleanReason: "Safe Flow",
    workflow: {
      name: "Prefect Flow",
      nodes: [ { id: "task-1", type: "prefect.task", parameters: { fn: "my_task" } } ]
    }
  }
"""

index = content.rfind("];")
if index != -1:
    content = content[:index] + new_negs + content[index:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Successfully updated negative fixtures!")
else:
    print("Could not find '];' in negative-fixtures.ts")
