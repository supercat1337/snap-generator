// @ts-check
import fs from 'node:fs';

/**
 * @typedef {Object} UserInfo
 * @prop {string} username
 * @prop {number} uid
 * @prop {number} gid
 * @prop {string} gecos
 * @prop {string} homedir
 * @prop {string} shell
 */

/**
 * @typedef {Object} GroupInfo
 * @prop {string} groupname
 * @prop {number} gid
 * @prop {string[]} members
 */

export class UserGroupInfo {
    constructor() {
        /** @type {Map<number, UserInfo>} */
        this.usersCache = new Map();

        /** @type {Map<number, GroupInfo>} */
        this.groupsCache = new Map();
        this.loadAll();
    }

    loadAll() {
        // Load all users
        try {
            const passwdContent = fs.readFileSync('/etc/passwd', 'utf8');
            passwdContent.split('\n').forEach(line => {
                if (!line) return;
                const [username, , uid, gid, gecos, homedir, shell] = line.split(':');
                this.usersCache.set(parseInt(uid), {
                    username,
                    uid: parseInt(uid),
                    gid: parseInt(gid),
                    gecos,
                    homedir,
                    shell,
                });
            });
        } catch (error) {
            console.warn('Cannot load /etc/passwd');
        }

        // Load all groups
        try {
            const groupContent = fs.readFileSync('/etc/group', 'utf8');
            groupContent.split('\n').forEach(line => {
                if (!line) return;
                const [groupname, , gid, members] = line.split(':');
                this.groupsCache.set(parseInt(gid), {
                    groupname,
                    gid: parseInt(gid),
                    members: members ? members.split(',') : [],
                });
            });
        } catch (error) {
            console.warn('Cannot load /etc/group');
        }
    }

    /**
     * Retrieves a user object by its UID.
     * @param {number} uid - The user ID to look up.
     * @returns {UserInfo|null} The user object if found, null otherwise.
     */
    getUserByUid(uid) {
        return this.usersCache.get(uid) || null;
    }

    /**
     * Retrieves a group object by its GID.
     * @param {number} gid - The group ID to look up.
     * @returns {GroupInfo|null} The group object if found, null otherwise.
     */
    getGroupByGid(gid) {
        return this.groupsCache.get(gid) || null;
    }

    /**
     * Retrieves a username by its UID.
     * @param {number} uid - The user ID to look up.
     * @returns {string|null} The username if found, null otherwise.
     */
    getUsernameByUid(uid) {
        const user = this.getUserByUid(uid);
        return user ? user.username : null;
    }

    /**
     * Retrieves a group name by its GID.
     * @param {number} gid - The group ID to look up.
     * @returns {string|null} The group name if found, null otherwise.
     */
    getGroupnameByGid(gid) {
        const group = this.getGroupByGid(gid);
        return group ? group.groupname : null;
    }

    /**
     * Retrieves an array of users that are part of a group.
     * @param {number} gid - The group ID to look up.
     * @returns {Array<Object>} An array of user objects that are part of the group.
     * @example
     * const usersInGroup = userGroupInfo.getUsersInGroup(1000);
     */
    getUsersInGroup(gid) {
        const group = this.getGroupByGid(gid);
        if (!group) return [];

        return Array.from(this.usersCache.values()).filter(
            user => user.gid === gid || group.members.includes(user.username)
        );
    }
}

/*
// usage:
const userGroupInfo = new UserGroupInfo();
const usersInGroup = userGroupInfo.getUsersInGroup(1000);

*/