.DEFAULT_GOAL := help

help:
	@echo "Targets: setup dev test test-e2e lint typecheck build docker-up docker-down db-migrate db-seed db-reset simulator clean"
setup:
	pnpm install
dev:
	pnpm dev
test:
	pnpm test
test-e2e:
	pnpm test:e2e
lint:
	pnpm lint
typecheck:
	pnpm typecheck
build:
	pnpm build
docker-up:
	docker compose up -d --build
docker-down:
	docker compose down
db-migrate:
	pnpm db:migrate
db-seed:
	pnpm db:seed
db-reset:
	docker compose down -v && docker compose up -d postgres && pnpm db:migrate && pnpm db:seed
simulator:
	pnpm --filter @ocean/simulator dev
clean:
	pnpm exec rimraf '**/node_modules' '**/.next' '**/dist' '**/coverage' '.turbo'
