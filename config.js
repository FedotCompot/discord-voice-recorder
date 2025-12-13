export default {
	RECORDINGS_FOLDER: process.env.RECORDINGS_FOLDER || './recordings',
	BOT_TOKEN: process.env.BOT_TOKEN || '',
	AUTHORIZED_USERS: process.env.AUTHORIZED_USERS ? process.env.AUTHORIZED_USERS.split(",").map(s => s.trim()) : []
};
