# Deploy servers script

USERNAME=${1}
TOKEN=${2}
REPOSITORY=${3}
AUTH_CLIENT_ID=${4}
AUTH_CLIENT_SECRET=${5}
API_URL=${6}
DATABASE_URL=${7}

set -v

docker container ls --all
docker container stop $(docker container ls --quiet) || true
docker container rm $(docker container ls --all --quiet) || true
docker login --username ${USERNAME} --password ${TOKEN} docker.pkg.github.com
docker image pull docker.pkg.github.com/${REPOSITORY}/willow-api
docker image pull docker.pkg.github.com/${REPOSITORY}/willow-client
docker image pull docker.pkg.github.com/${REPOSITORY}/willow-tracer-java
docker image pull docker.pkg.github.com/${REPOSITORY}/willow-tracer-python
docker image prune --force

docker network create willow-network || true

JAVA_TRACER="docker run --rm -i docker.pkg.github.com/${REPOSITORY}/willow-tracer-java --silent"
PYTHON_TRACER="docker run --rm -i docker.pkg.github.com/${REPOSITORY}/willow-tracer-python --silent"

sudo docker container run \
    --rm --detach --network willow-network --publish 443:8000 \
    --volume /var/run/docker.sock:/var/run/docker.sock \
    docker.pkg.github.com/${REPOSITORY}/willow-api \
    -- \
    --tracer python "${PYTHON_TRACER}" \ # --tracer java "${JAVA_TRACER}" \
    --auth \
    --auth-client-id "${AUTH_CLIENT_ID}" \
    --auth-client-secret "${AUTH_CLIENT_SECRET}" \
    --db \
    --db-url "${DATABASE_URL}" \
    --db-name 'willow' \
    --port 8000

sudo docker container run --name willow-client \
    --rm --detach --network willow-network --publish 80:8000 \
    --env "API=${API_URL}" \
    --env 'PORT=8000' \
    docker.pkg.github.com/${REPOSITORY}/willow-client