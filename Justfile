set dotenv-load := true

install:
    npm ci

dev:
    npm run dev

build:
    npm run build

start:
    npm run start

test *args:
    npm run test -- {{args}}

typecheck:
    npm run typecheck

lint:
    npm run lint

format:
    npm run format

db-migrate:
    npm run db:migrate

db-reset:
    npm run db:reset

db-seed:
    npm run db:seed

db-import:
    npm run db:import

docker-build:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml build

docker-up:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml up -d --build

docker-down:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml down

docker-logs:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml logs -f api web

docker-dev-config:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml config --quiet

docker-dev-build:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml build

docker-dev-up:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml up -d --build

docker-dev-down:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml down

docker-dev-logs:
    docker compose -p work-ouch-dev -f compose.yaml -f compose.dev.yaml logs -f api web

docker-prod-config:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml config --quiet

docker-prod-build:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml build

docker-prod-up:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml up -d --build

docker-prod-down:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml down

docker-prod-logs:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml logs -f api web

docker-prod-nginx-check:
    docker compose -p work-ouch -f compose.yaml -f compose.prod.yaml run --rm --no-deps web nginx -t

web-install:
    npm --prefix web ci
web-dev:
    npm --prefix web run dev
web-lint:
    npm --prefix web run lint
web-typecheck:
    npm --prefix web run typecheck
web-test:
    npm --prefix web run test
web-build:
    npm --prefix web run build
web-e2e:
    npm --prefix web run e2e
verify:
    npm run lint
    npm run test
    npm --prefix web run lint
    npm --prefix web run typecheck
    npm --prefix web run test
    npm run build
    npm --prefix web run build
