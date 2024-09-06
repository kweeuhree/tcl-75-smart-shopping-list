const RadioInputElement = ({ children, id, value, checked, onChange }) => {
	return (
		<>
			<input
				type="radio"
				id={id}
				value={value}
				checked={checked}
				onChange={onChange}
			/>
			<label htmlFor={id}>{children}</label>
			<br />
		</>
	);
};

export default RadioInputElement;
