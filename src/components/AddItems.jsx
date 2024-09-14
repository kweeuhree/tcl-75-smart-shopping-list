import { useCallback } from 'react';
import { useStateWithStorage } from '../utils';
import { addItem } from '../api';
import TextInputElement from './TextInputElement';
import RadioInputElement from './RadioInputElement';

const nextPurchaseDate = {
	soon: 7,
	kindOfSoon: 14,
	notSoon: 30,
};

const radioInputOptions = {
	soon: ['soon', nextPurchaseDate.soon, 'Soon'],
	kindOfSoon: ['kindofsoon', nextPurchaseDate.kindOfSoon, 'Kind of soon'],
	notSoon: ['notsoon', nextPurchaseDate.notSoon, 'Not Soon'],
};

export function AddItems({ items }) {
	const [listPath] = useStateWithStorage('tcl-shopping-list-path', null);

	const handleSubmit = useCallback(
		async (event) => {
			event.preventDefault();

			const itemName = event.target.elements['item-name'].value;
			const normalizedItemName = itemName
				.trim()
				.toLowerCase()
				.replace(/[&\/\\#, +$!,~%.'":*?<>{}]/g, '');
			if (items) {
				const currentItems = items.map((item) =>
					item.name
						.trim()
						.toLowerCase()
						.replace(/[&\/\\#, +$!,~%.'":*?<>{}]/g, ''),
				);
				if (currentItems.includes(normalizedItemName)) {
					alert('This item already exists in the list');
					event.target.reset();
					return;
				}
			}

			const daysUntilNextPurchase =
				event.target.elements['purchase-date'].value;

			try {
				await addItem(listPath, {
					itemName,
					daysUntilNextPurchase,
				});
				alert(
					`${itemName} was added to the list! The next purchase date is set to ${daysUntilNextPurchase} days from now.`,
				);
			} catch (error) {
				alert(`Item was not added to the itemsbase, Error: ${error.message}`);
			} finally {
				event.target.reset();
			}
		},
		[listPath],
	);

	return (
		<div>
			<form onSubmit={handleSubmit}>
				<TextInputElement
					type="text"
					id="item-name"
					placeholder="Enter item name"
				>
					Item Name:
				</TextInputElement>

				{Object.values(radioInputOptions).map((option) => (
					<RadioInputElement key={option[0]} id={option[0]} value={option[1]}>
						{option[2]}
					</RadioInputElement>
				))}

				<button type="submit">Submit</button>
			</form>
		</div>
	);
}
