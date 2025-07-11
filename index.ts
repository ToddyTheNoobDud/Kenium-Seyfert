import { Client, HttpClient, ParseClient } from "seyfert";

import { createRequire } from "module";
import'dotenv/config';
const { NODE_HOST, NODE_PASSWORD, NODE_PORT, NODE_NAME } = process.env;

// @ts-ignore
const require = createRequire(import.meta.url);
const { Aqua } = require('aqualink');

declare module 'seyfert' {
    interface UsingClient extends ParseClient<Client<true>> { }
    interface UsingClient extends ParseClient<HttpClient> { }
}


const client = new Client();

const aqua = new Aqua(client, [{
    host: NODE_HOST,
    password: NODE_PASSWORD,
    port: NODE_PORT,
    secure: false,
    name: NODE_NAME
}], {
    defaultSearchPlatform: "ytsearch",
    restVersion: "v4",
    shouldDeleteMessage: true,
    infiniteReconnects: true,
    autoResume: true,
    leaveOnEnd: false,
});


Object.assign(client, {
    aqua,
});

aqua.on('nodeError', (node, error) => console.error(`Node error: ${error}`));
aqua.on('nodeConnect', node => console.log(`Node connected: ${node.name}`));
aqua.on("debug", message => console.debug(`[Aqua/Debug] ${message}`));

aqua.on('debug', message => console.log(`[Aqua/Debug] ${message}`));
aqua.on("debug", message => console.log(`[Aqua/Debug] ${message}`));

client.start().then(() =>
    client.uploadCommands({ cachePath: "./commands.json" })
);
