import { createReadStream } from "node:fs";
import path from "node:path";
import BoxSDK from "box-node-sdk";
import { config, requireKey } from "../config.js";

export interface BoxUploadResult {
  fileId: string;
  name: string;
  sharedLink?: string;
}

export async function uploadToBox(
  localPath: string,
  destinationFolderId: string = config.BOX_DESTINATION_FOLDER_ID,
): Promise<BoxUploadResult> {
  const token = requireKey("BOX_DEVELOPER_TOKEN");
  const sdk = new BoxSDK({ clientID: "n/a", clientSecret: "n/a" });
  const client = sdk.getBasicClient(token);

  const name = path.basename(localPath);
  const stream = createReadStream(localPath);
  const result = await client.files.uploadFile(destinationFolderId, name, stream);
  const file = result.entries[0];
  if (!file) throw new Error("Box upload returned no file");

  const shared = await client.files
    .update(file.id, { shared_link: { access: "open" } })
    .catch(() => null);

  return {
    fileId: file.id,
    name: file.name,
    sharedLink: shared?.shared_link?.url,
  };
}
