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
    docker compose build

docker-up:
    docker compose up -d --build

docker-down:
    docker compose down

docker-logs:
    docker compose logs -f api

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
