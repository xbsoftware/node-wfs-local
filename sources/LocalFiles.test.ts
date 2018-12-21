/* tslint:disable:no-implicit-dependencies */
import { expect } from "chai";
import "mocha";

import * as fs from "fs-extra";
import LocalFiles from "./LocalFiles";
import { ForceRootPolicy } from "./policy";

function cleanDates(data){
	data.forEach(key => {
		if (key.files && key.files.length){
			cleanDates(key.files);
		}
	});
}

let drive : LocalFiles;
describe("LocalFiles", () => {
	beforeEach(async () => {
		const root = await fs.realpath(__dirname + "/../test/sandbox");
		drive = new LocalFiles(root);
	});

	describe("exists", () => {
		it("Can check does file exist", async () => {
			const check1 = await drive.exists("/sub");
			const check2 = await drive.exists("/sub2");

			expect(check1).to.eq(true);
			expect(check2).to.eq(false);
		});
	});

	describe("info", () => {
		it("Get info about a file", async () => {
			const info1 = await drive.info("/sub");
			expect(info1.value).to.eq("sub");
			expect(info1.type).to.eq("folder");

			const info2 = await drive.info("/a.txt");
			expect(info2.value).to.eq("a.txt");
			expect(info2.type).to.eq("text");
		});
	});

	describe("mkdir", () => {
		it("Can create a folder", async () => {
			await drive.mkdir("/alfa/123/a");

			const check = await drive.exists("/alfa/123/a");
			expect(check).to.eq(true);

			await drive.remove("/alfa");
		});
	});

	describe("copy", () => {
		it("Can copy a file", async () => {
			const path = __dirname+"/../test/sandbox/sub/deep/copy.doc";
			const path2 = __dirname+"/../test/sandbox/sub/deep.doc";

			await drive.copy("/sub/deep/deep.doc", "/sub/deep/copy.doc");
			const check = await fs.pathExists(path);
			expect(check).to.eq(true);
			await fs.unlink(path);

			await drive.copy("/sub/deep/deep.doc", "/sub");
			const check2 = await fs.pathExists(path2);
			expect(check2).to.eq(true);
			await fs.unlink(path2);

			await drive.copy("/sub/deep/deep.doc", "/sub/");
			const check3 = await fs.pathExists(path2);
			expect(check3).to.eq(true);
			await fs.unlink(path2);
		});

		it("Can copy a folder", async () => {
			const path = __dirname+"/../test/sandbox/sub2";

			await drive.copy("/sub", "/sub2");
			const list1 = await drive.list("/sub", { subFolders: true });
			const list2 = await drive.list("/sub2", { subFolders: true });
			expect(cleanDates(list1)).to.deep.eq(cleanDates(list2));

			await drive.copy("/sub", "/sub2/");
			const list3 = await drive.list("/sub2/sub", { subFolders: true });
			expect(cleanDates(list1)).to.deep.eq(cleanDates(list3));

			await fs.remove(path);
		});
	});

	describe("move", () => {
		it("Can move a file", async () => {
			const path1 = __dirname+"/../test/sandbox/sub/deep/deep.doc";
			const path2 = __dirname+"/../test/sandbox/sub/deep/copy.doc";

			await drive.move("/sub/deep/deep.doc", "/sub/deep/copy.doc");
			const check1 = await fs.pathExists(path1);
			const check2 = await fs.pathExists(path2);
			expect(check1).to.eq(false);
			expect(check2).to.eq(true);
			await fs.move(path2, path1);
		});

		it("Can move a folder", async () => {
			const path1 = __dirname+"/../test/sandbox/sub3";
			const path2 = __dirname+"/../test/sandbox/sub2";
			const path3 = __dirname+"/../test/sandbox/sub/deep/sub2";

			await drive.copy("/sub", "/sub3");
			await drive.move("/sub3", "/sub2");
			const list1 = await drive.list("/sub", { subFolders: true });
			const list2 = await drive.list("/sub2", { subFolders: true });
			expect(cleanDates(list1)).to.deep.eq(cleanDates(list2));
			const check1 = await fs.pathExists(path1);
			expect(check1).to.eq(false);

			await drive.move("/sub2", "/sub/deep");
			const list3 = await drive.list("/sub/deep/sub2", { subFolders: true });
			expect(cleanDates(list1)).to.deep.eq(cleanDates(list3));
			const check2 = await fs.pathExists(path2);
			expect(check2).to.eq(false);

			await fs.remove(path3);
		});
	});

	describe("remove", () => {
		it("Can delete a file", async () => {
			const path = __dirname+"/../test/sandbox/sub/deep/copy.doc";
			await fs.writeFile(path, "test");

			await drive.remove("/sub/deep/copy.doc");

			const check = await fs.pathExists(path);
			expect(check).to.eq(false);
		});
	});

	describe("write", () => {
		it("Can write a file", async () => {
			const data = await drive.read("/sub/deep/deep.doc");
			await drive.write("/sub/deep/copy.doc", data);

			const path = __dirname+"/../test/sandbox/sub/deep/copy.doc";
			const text = await fs.readFile(path);
			expect(text.toString("utf8")).to.eq("test");
			await fs.unlink(path);
		});
	});

	describe("read", () => {
		it("Can read a file", async () => {
			const data = await drive.read("/sub/deep/deep.doc");

			return new Promise((res, rej) => {
				let text = "";
				data.on("data", chunk => {
					text += chunk.toString("utf8");
				});

				data.on("end", () => {
					expect(text).to.eq("test");
					res();
				});
			});
		});
	});

	describe("list", () => {

		it("Can read root", async () => {
			const data = await drive.list("/");

			expect(data.length).to.eq(3);

			expect(data[0].value).to.eq("sub");
			expect(data[0].id).to.eq("/sub");
			expect(!!data[0].data).to.eq(false);
			expect(data[0].type).to.eq("folder");

			expect(data[1].value).to.eq("a.txt");
			expect(data[2].value).to.eq("b.txt");
			expect(data[1].type).to.eq("text");
		});

		it("Can read sub level", async () => {
			const data = await drive.list("/sub");

			expect(data.length).to.eq(2);

			expect(data[0].value).to.eq("deep");
			expect(!!data[0].data).to.eq(false);

			expect(data[1].value).to.eq("c.jpg");
		});

		it("Can read folders only", async () => {
			const data = await drive.list("/", { skipFiles: true });

			expect(data.length).to.eq(1);
			expect(data[0].value).to.eq("sub");
		});


		it("Can read nested folders", async () => {
			const data = await drive.list("/", { skipFiles: true, subFolders:true, nested:true });

			expect(data.length).to.eq(1);
			expect(data[0].value).to.eq("sub");
			expect(data[0].data.length).to.eq(1);
			expect(data[0].data[0].value).to.eq("deep");
			expect(data[0].data[0].id).to.eq("/sub/deep");
			expect(data[0].data[0].data.length).to.eq(0);
		});

		it("Can read nested files and folders", async () => {
			const data = await drive.list("/", { subFolders:true, nested:true });

			expect(data.length).to.eq(3);
			expect(data[0].data.length).to.eq(2);
			expect(data[0].data[0].data.length).to.eq(1);
		});

		it("Prevent access outside of root", async () => {
			try {
				const data = await drive.list("../");
			} catch(e){
				return;
			}
			expect.fail();
		});

		it("Prevent wrong root value", async () => {
			try {
				new LocalFiles("./data");
			} catch(e){
				return;
			}
			expect.fail();
        });

		it("Normalize root value", async () => {
			const path = await fs.realpath(__dirname + "/../test/sandbox");
			const sdrive = new LocalFiles(path + "/sub/../");
			const exists = await sdrive.exists("sub");

			expect(exists).to.eq(true);
        });
			

		it("Can include by mask", async () => {
			const data = await drive.list("/", {
				subFolders:true,
				include: file => /\.(txt|doc)$/.test(file)
			});
			expect(data.length).to.eq(3);
			expect(data[0].value).to.eq("a.txt");
			expect(data[1].value).to.eq("b.txt");
			expect(data[2].value).to.eq("deep.doc");
		});

		it("Can exclude by mask", async () => {
			const data = await drive.list("/", { exclude: file => file === "a.txt" });
			expect(data.length).to.eq(2);
			expect(data[0].value).to.eq("sub");
			expect(data[1].value).to.eq("b.txt");
		});
	});
});