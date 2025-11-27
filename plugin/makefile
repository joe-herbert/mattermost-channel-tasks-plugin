PLUGIN_ID = com.mattermost.channel-task
PLUGIN_VERSION = 1.5.3

.PHONY: all
all: server webapp bundle

.PHONY: server
server:
	mkdir -p server/dist
	cd server && GOOS=linux GOARCH=amd64 go build -o dist/plugin-linux-amd64 .
	cd server && GOOS=darwin GOARCH=arm64 go build -o dist/plugin-darwin-arm64 .

.PHONY: webapp
webapp:
	cd webapp && npm install && npm run build

.PHONY: bundle
bundle:
	rm -rf dist
	mkdir -p dist
	cp plugin.json dist/
	mkdir -p dist/server/dist
	cp server/dist/plugin-linux-amd64 dist/server/dist/
	cp server/dist/plugin-darwin-arm64 dist/server/dist/
	mkdir -p dist/webapp/dist
	cp webapp/dist/main.js dist/webapp/dist/
	cd dist && tar -czf $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz plugin.json server webapp

.PHONY: clean
clean:
	rm -rf dist
	rm -rf server/dist
	rm -rf webapp/dist
	rm -rf webapp/node_modules