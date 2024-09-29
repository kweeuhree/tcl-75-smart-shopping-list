import {
	arrayUnion,
	getDoc,
	setDoc,
	addDoc,
	collection,
	doc,
	onSnapshot,
	updateDoc,
	deleteDoc,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './config';
import {
	addDaysFromToday,
	getDateLastPurchasedOrDateCreated,
	getDaysBetweenDates,
	getDaysFromDate,
} from '../utils';

/**
 * A custom hook that subscribes to the user's shopping lists in our Firestore
 * database and returns new data whenever the lists change.
 * @param {string | null} userId
 * @param {string | null} userEmail
 * @returns
 */
export function useShoppingLists(userId, userEmail) {
	// Start with an empty array for our data.
	const initialState = [];
	const [data, setData] = useState(initialState);

	useEffect(() => {
		// If we don't have a userId or userEmail (the user isn't signed in),
		// we can't get the user's lists.
		if (!userId || !userEmail) return;

		// When we get a userEmail, we use it to subscribe to real-time updates
		const userDocRef = doc(db, 'users', userEmail);

		onSnapshot(userDocRef, (docSnap) => {
			if (docSnap.exists()) {
				const listRefs = docSnap.data().sharedLists;
				const newData = listRefs.map((listRef) => {
					// We keep the list's id and path so we can use them later.
					return { name: listRef.id, path: listRef.path };
				});
				setData(newData);
			}
		});
	}, [userId, userEmail]);

	return data;
}

/**
 * A custom hook that subscribes to a shopping list in our Firestore database
 * and returns new data whenever the list changes.
 * @param {string | null} listPath
 * @see https://firebase.google.com/docs/firestore/query-data/listen
 */
export function useShoppingListData(listPath) {
	// Start with an empty array for our data.
	/** @type {import('firebase/firestore').DocumentData[]} */
	const initialState = [];
	const [data, setData] = useState(initialState);

	useEffect(() => {
		if (!listPath) return;

		// When we get a listPath, we use it to subscribe to real-time updates
		// from Firestore.
		return onSnapshot(collection(db, listPath, 'items'), (snapshot) => {
			// The snapshot is a real-time update. We iterate over the documents in it
			// to get the data.
			const nextData = snapshot.docs.map((docSnapshot) => {
				// Extract the document's data from the snapshot.
				const item = docSnapshot.data();

				// The document's id is not in the data,
				// but it is very useful, so we add it to the data ourselves.
				item.id = docSnapshot.id;

				return item;
			});

			// Update our React state with the new data.
			setData(nextData);
		});
	}, [listPath]);

	// Return the data so it can be used by our React components.
	return data;
}

/**
 * Add a new user to the users collection in Firestore.
 * @param {Object} user The user object from Firebase Auth.
 */
export async function addUserToDatabase(user) {
	// Check if the user already exists in the database.
	const userDoc = await getDoc(doc(db, 'users', user.email));
	// If the user already exists, we don't need to do anything.
	if (userDoc.exists()) {
		return;
	} else {
		// If the user doesn't exist, add them to the database.
		// We'll use the user's email as the document id
		// because it's more likely that the user will know their email
		// than their uid.
		await setDoc(doc(db, 'users', user.email), {
			email: user.email,
			name: user.displayName,
			uid: user.uid,
		});
	}
}

/**
 * Create a new list and add it to a user's lists in Firestore.
 * @param {string} userId The id of the user who owns the list.
 * @param {string} userEmail The email of the user who owns the list.
 * @param {string} listName The name of the new list.
 */
export async function createList(userId, userEmail, listName) {
	const listDocRef = doc(db, userId, listName);

	await setDoc(listDocRef, {
		owner: userId,
	});

	const userDocumentRef = doc(db, 'users', userEmail);

	updateDoc(userDocumentRef, {
		sharedLists: arrayUnion(listDocRef),
	});
	return listDocRef.path;
}

/**
 * Shares a list with another user.
 * @param {string} listPath The path to the list to share.
 * @param {string} recipientEmail The email of the user to share the list with.
 */
export async function shareList(listPath, currentUserId, recipientEmail) {
	// Check if current user is owner.
	if (!listPath.includes(currentUserId)) {
		return '!owner';
	}
	// Get the document for the recipient user.
	const usersCollectionRef = collection(db, 'users');
	const recipientDoc = await getDoc(doc(usersCollectionRef, recipientEmail));
	// If the recipient user doesn't exist, we can't share the list.
	if (!recipientDoc.exists()) {
		return;
	}
	// Add the list to the recipient user's sharedLists array.
	const listDocumentRef = doc(db, listPath);
	const userDocumentRef = doc(db, 'users', recipientEmail);
	try {
		updateDoc(userDocumentRef, {
			sharedLists: arrayUnion(listDocumentRef),
		});
		return 'shared';
	} catch {
		return;
	}
}

/**
 * Add a new item to the user's list in Firestore.
 * @param {string} listPath The path of the list we're adding to.
 * @param {Object} itemData Information about the new item.
 * @param {string} itemData.itemName The name of the item.
 * @param {number} itemData.daysUntilNextPurchase The number of days until the user thinks they'll need to buy the item again.
 */
export async function addItem(listPath, { itemName, daysUntilNextPurchase }) {
	const listCollectionRef = collection(db, listPath, 'items');
	return addDoc(listCollectionRef, {
		dateCreated: new Date(),
		dateLastPurchased: null,
		dateNextPurchased: addDaysFromToday(daysUntilNextPurchase),
		name: itemName,
		totalPurchases: 0,
	});
}

/**
 * Update an item in the user's list in Firestore with new purchase information.
 * @param {string} listPath The path of the list the item belongs to.
 * @param {string} itemId The ID of the item being updated.
 * @param {Object} updatedData Object containing the updated item data.
 * @param {Date} updatedData.dateLastPurchased The date the item was last purchased.
 * @param {Date} updatedData.dateNextPurchased The estimated date for the next purchase.
 * @param {number} updatedData.totalPurchases The total number of times the item has been purchased.
 * @returns {Promise<string>} A message confirming the item was successfully updated.
 * @throws {Error} If the item update fails.
 */
export async function updateItem(
	listPath,
	itemId,
	{ dateLastPurchased, dateNextPurchased, totalPurchases },
) {
	// reference the item path
	const itemDocRef = doc(db, listPath, 'items', itemId);
	// update the item with the purchase date and increment the total purchases made
	try {
		await updateDoc(itemDocRef, {
			dateLastPurchased,
			dateNextPurchased,
			totalPurchases,
		});
		return 'item purchased';
	} catch (error) {
		throw new Error(`Failed updating item: ${error.message}`);
	}
}

export async function deleteItem(listPath, itemId) {
	// reference the item path
	const itemDocRef = doc(db, listPath, 'items', itemId);
	try {
		// delete the item from the database
		await deleteDoc(itemDocRef);
	} catch (error) {
		throw new Error(`Failed updating item: ${error.message}`);
	}
}

export let urgencyObject = {
	overdue: new Set(),
	soon: new Set(),
	kindOfSoon: new Set(),
	notSoon: new Set(),
	inactive: new Set(),
};

/**
 * Sorts an item into one of four urgency categories based on the provided urgency status.
 *
 * Items are categorized into 'soon', 'kindOfSoon', 'notSoon', or 'inactive' based on the urgency.
 *
 * @param {Object} item - The item to be categorized. Should include at least a `name` property.
 * @param {number} urgencyStatus - The urgency status of the item, used to determine its category.
 * @throws Will throw an error if the item cannot be placed in a category.
 */
const sortByUrgency = (item, daysUntilNextPurchase) => {
	if (item.name.includes('sun')) {
		console.log(`${item.name} urgencyStatus ${daysUntilNextPurchase}`);
	}
	if (daysUntilNextPurchase < 0) {
		urgencyObject.overdue.add(item);
		return;
	} else if (daysUntilNextPurchase === 1000) {
		urgencyObject.inactive.add(item);
		return;
	} else if (daysUntilNextPurchase < 7) {
		urgencyObject.soon.add(item);
		return;
	} else if (daysUntilNextPurchase >= 7 && daysUntilNextPurchase < 30) {
		urgencyObject.kindOfSoon.add(item);
		return;
	} else if (daysUntilNextPurchase >= 30) {
		urgencyObject.notSoon.add(item);
		return;
	} else {
		throw new Error(`Failed to place [${item.name}]`);
	}
};

/**
 * Calculates the urgency of an item based on the number of days
 * since it was last purchased or created, and the time until the next purchase date.
 *
 * @param {Object} item - The item object containing relevant date information.
 * @param {string | null} item.dateLastPurchased - The date when the item was last purchased, or null if never purchased.
 * @param {string} item.dateCreated - The date when the item was created.
 * @returns {number} - The urgency of the item:
 *  - `100` if more than 60 days have passed since the last purchase or creation,
 *  - or the number of days until the next purchase if fewer than 60 days have passed.
 */
const getItemUrgency = (item) => {
	// get date the item was purchased or created
	const itemDate = getDateLastPurchasedOrDateCreated(
		item.dateLastPurchased,
		item.dateCreated,
	);
	// check how many days have passed since that date
	const daysToToday = getDaysFromDate(itemDate);

	// if more than 60 days have passed
	if (daysToToday >= 60) {
		// sort as inactive
		sortByUrgency(item, 1000);
		return 1000;
	} else {
		// sort by the amount of days until next purchase date
		const daysUntilNextPurchase = getDaysBetweenDates(
			new Date(),
			item.dateNextPurchased.toDate(),
		);
		if (item.name.includes('sun')) {
			console.log(
				`${item.name} days until next purchase is ${daysUntilNextPurchase}`,
			);
		}
		sortByUrgency(item, daysUntilNextPurchase);

		return daysUntilNextPurchase;
	}
};

/**
 * Compares the urgency of purchasing two items based on their last purchase or creation date.
 *
 * @param {Object} item1 The first item to compare, containing purchase or creation data.
 * @param {Object} item2 The second item to compare, containing purchase or creation data.
 * @returns {number} A negative number if item1 is more urgent,
 *                   a positive number if item2 is more urgent,
 *                   or 0 if they have equal urgency, which leads to sorting by name.
 */
export function comparePurchaseUrgency(item1, item2) {
	const item1UrgencyStatus = getItemUrgency(item1);
	const item2UrgencyStatus = getItemUrgency(item2);

	if (item1UrgencyStatus === item2UrgencyStatus) {
		console.log(`Sorting alphabetically: ${item1.name} vs ${item2.name}`);
		return item1.name.localeCompare(item2.name);
	}
	// otherwise sort in descending order
	return item1UrgencyStatus - item2UrgencyStatus;
}
